-- =====================================================================
-- Trung tâm ScienceHub - FILE 02: TOÀN BỘ TRIGGER BẢO VỆ DỮ LIỆU
-- Chạy SAU 01_schema.sql.
-- Gom toàn bộ 16 trigger (13 nhóm quy tắc) bảo toàn lịch sử & đồng bộ trạng thái về 1 nơi.
-- An toàn khi chạy lại nhiều lần.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Chặn đổi mã tự sinh (student_code / parent_code)
--    Đọc qua to_jsonb(new) để tránh lỗi biên dịch chéo trường của PL/pgSQL.
-- ---------------------------------------------------------------------
create or replace function public.prevent_code_change()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'students' then
    if to_jsonb(new)->>'student_code' is distinct from to_jsonb(old)->>'student_code' then
      raise exception 'Không được đổi mã học sinh.';
    end if;
  elsif tg_table_name = 'parents' then
    if to_jsonb(new)->>'parent_code' is distinct from to_jsonb(old)->>'parent_code' then
      raise exception 'Không được đổi mã phụ huynh.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_code_immutable on public.students;
create trigger trg_students_code_immutable
  before update on public.students
  for each row execute function public.prevent_code_change();

drop trigger if exists trg_parents_code_immutable on public.parents;
create trigger trg_parents_code_immutable
  before update on public.parents
  for each row execute function public.prevent_code_change();

-- ---------------------------------------------------------------------
-- 2. Quy tắc ẩn/khôi phục Giáo viên & Tự khóa tài khoản khi ẩn Giáo viên
-- ---------------------------------------------------------------------
create or replace function public.check_teacher_soft_delete()
returns trigger language plpgsql as $$
declare
  v_class_count integer;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    select count(*) into v_class_count
    from public.classes
    where teacher_id = new.id and deleted_at is null;

    if v_class_count > 0 then
      raise exception 'Giáo viên đang phụ trách % lớp. Hãy chuyển lớp cho giáo viên khác trước.', v_class_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teachers_soft_delete_guard on public.teachers;
create trigger trg_teachers_soft_delete_guard
  before update of deleted_at on public.teachers
  for each row execute function public.check_teacher_soft_delete();

-- Khi giáo viên bị ẩn => tự khóa profiles.active = false (khôi phục GV không tự mở lại)
create or replace function public.deactivate_profile_on_teacher_hide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.profiles
    set active = false
    where teacher_id = new.id and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teachers_deactivate_profile on public.teachers;
create trigger trg_teachers_deactivate_profile
  after update of deleted_at on public.teachers
  for each row execute function public.deactivate_profile_on_teacher_hide();

-- ---------------------------------------------------------------------
-- 3. Quy tắc trên bảng Lớp học (classes):
--    a) Chặn ẩn lớp khi còn học sinh 'active'
--    b) Lớp đang hiển thị không được trỏ tới giáo viên đã ẩn
--    c) Đổi khối của lớp: chặn nếu học sinh đang học lớp khác khối mới;
--       hợp lệ thì cập nhật khối cho các học sinh đang học lớp này.
-- ---------------------------------------------------------------------
create or replace function public.check_class_soft_delete()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from public.class_enrollments
      where class_id = new.id and status = 'active'
    ) then
      raise exception 'Trung tâm không thể xóa lớp khi lớp còn học sinh đang học.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_classes_soft_delete_guard on public.classes;
create trigger trg_classes_soft_delete_guard
  before update of deleted_at on public.classes
  for each row execute function public.check_class_soft_delete();

create or replace function public.check_class_teacher_visible()
returns trigger language plpgsql as $$
declare
  v_teacher_hidden boolean;
  v_teacher_name   text;
begin
  if new.deleted_at is null and new.teacher_id is not null then
    select (deleted_at is not null), full_name
      into v_teacher_hidden, v_teacher_name
    from public.teachers
    where id = new.teacher_id;

    if coalesce(v_teacher_hidden, false) then
      raise exception 'Giáo viên % đang bị ẩn. Hãy khôi phục giáo viên đó hoặc chọn giáo viên khác cho lớp.', v_teacher_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_classes_teacher_visible on public.classes;
create trigger trg_classes_teacher_visible
  before insert or update of deleted_at, teacher_id on public.classes
  for each row execute function public.check_class_teacher_visible();

create or replace function public.check_class_grade_change()
returns trigger language plpgsql as $$
declare
  v_student    text;
  v_other_name text;
begin
  if new.grade is null or new.grade is not distinct from old.grade then
    return new;
  end if;

  select s.full_name, c2.name
    into v_student, v_other_name
  from public.class_enrollments e
  join public.students s on s.id = e.student_id
  join public.class_enrollments e2
    on e2.student_id = e.student_id and e2.status = 'active' and e2.class_id <> new.id
  join public.classes c2 on c2.id = e2.class_id
  where e.class_id = new.id
    and e.status = 'active'
    and public.class_effective_grade(e2.class_id) is not null
    and public.class_effective_grade(e2.class_id) <> new.grade
  limit 1;

  if found then
    raise exception 'Không thể đổi lớp sang khối %: học sinh % còn đang học lớp % thuộc khối khác. Hãy cho học sinh đó nghỉ lớp kia trước.',
      new.grade, v_student, v_other_name;
  end if;

  update public.students
  set grade = new.grade
  where grade is distinct from new.grade
    and id in (
      select student_id from public.class_enrollments
      where class_id = new.id and status = 'active'
    );

  return new;
end;
$$;

drop trigger if exists trg_classes_grade_guard on public.classes;
create trigger trg_classes_grade_guard
  before update of grade on public.classes
  for each row execute function public.check_class_grade_change();

-- ---------------------------------------------------------------------
-- 4. Quy tắc trên bảng Học sinh & Đồng bộ ẩn/hiện Phụ huynh
--    a) Chặn ẩn học sinh khi còn lớp 'active'
--    b) Chặn bỏ ẩn học sinh nếu chưa thuộc lớp 'active' nào
--    c) Phụ huynh tự ẩn khi hết con hiển thị, tự hiện lại khi có con hiển thị
-- ---------------------------------------------------------------------
create or replace function public.check_student_soft_delete()
returns trigger language plpgsql as $$
declare
  v_active_count integer;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    select count(*) into v_active_count
    from public.class_enrollments
    where student_id = new.id and status = 'active';

    if v_active_count > 0 then
      raise exception 'Học sinh đang học % lớp. Hãy cho học sinh nghỉ khỏi lớp trước.', v_active_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_soft_delete_guard on public.students;
create trigger trg_students_soft_delete_guard
  before update of deleted_at on public.students
  for each row execute function public.check_student_soft_delete();

create or replace function public.check_student_restore()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is null and old.deleted_at is not null then
    if not exists (
      select 1 from public.class_enrollments
      where student_id = new.id and status = 'active'
    ) then
      raise exception 'Học sinh chưa thuộc lớp nào. Hãy thêm học sinh vào một lớp, học sinh sẽ tự hiện lại.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_restore_guard on public.students;
create trigger trg_students_restore_guard
  before update of deleted_at on public.students
  for each row execute function public.check_student_restore();

create or replace function public.sync_parent_visibility(p_parent_id uuid)
returns void language plpgsql as $$
begin
  if p_parent_id is null then
    return;
  end if;

  if exists (
    select 1 from public.students
    where parent_id = p_parent_id and deleted_at is null
  ) then
    update public.parents set deleted_at = null
    where id = p_parent_id and deleted_at is not null;
  else
    update public.parents set deleted_at = now()
    where id = p_parent_id and deleted_at is null;
  end if;
end;
$$;

create or replace function public.trg_students_sync_parent()
returns trigger language plpgsql as $$
begin
  perform public.sync_parent_visibility(new.parent_id);
  if tg_op = 'UPDATE' and old.parent_id is distinct from new.parent_id then
    perform public.sync_parent_visibility(old.parent_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_sync_parent on public.students;
create trigger trg_students_sync_parent
  after insert or update of parent_id, deleted_at on public.students
  for each row execute function public.trg_students_sync_parent();

-- ---------------------------------------------------------------------
-- 5. Quy tắc trên bảng Ghi danh (class_enrollments):
--    a) Trước khi INSERT: lớp chưa ẩn, joined_at <= hôm nay
--    b) Trước khi INSERT: kiểm tra cùng khối & tự gán khối cho học sinh
--    c) Sau khi INSERT 'active': tự bỏ ẩn học sinh
--    d) Trước khi UPDATE status/left_at: left_at <= hôm nay và >= mọi điểm danh
--    e) Sau khi UPDATE sang 'dropped': tự ẩn học sinh nếu hết lớp 'active'
-- ---------------------------------------------------------------------
create or replace function public.check_enrollment_insert()
returns trigger language plpgsql as $$
declare
  v_class_hidden_at timestamptz;
  v_today           date := public.vn_today();
begin
  if new.status = 'active' then
    select deleted_at into v_class_hidden_at from public.classes where id = new.class_id;
    if v_class_hidden_at is not null then
      raise exception 'Lớp này đã bị ẩn. Hãy khôi phục lớp trước khi thêm học sinh.';
    end if;
  end if;

  if new.joined_at > v_today then
    raise exception 'Ngày vào lớp không được ở tương lai.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_insert_guard on public.class_enrollments;
create trigger trg_enrollments_insert_guard
  before insert on public.class_enrollments
  for each row execute function public.check_enrollment_insert();

create or replace function public.check_enrollment_grade()
returns trigger language plpgsql as $$
declare
  v_grade      integer;
  v_other_name text;
  v_other      integer;
  v_student    text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  v_grade := public.class_effective_grade(new.class_id);
  if v_grade is null then
    return new;
  end if;

  select c.name, public.class_effective_grade(e.class_id)
    into v_other_name, v_other
  from public.class_enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = new.student_id
    and e.status = 'active'
    and e.class_id <> new.class_id
    and public.class_effective_grade(e.class_id) is not null
    and public.class_effective_grade(e.class_id) <> v_grade
  limit 1;

  if found then
    select full_name into v_student from public.students where id = new.student_id;
    raise exception 'Học sinh % đang học lớp % (khối %), không thể thêm vào lớp khối %. Trung tâm chỉ xếp học sinh vào các lớp cùng khối.',
      v_student, v_other_name, v_other, v_grade;
  end if;

  update public.students
  set grade = v_grade
  where id = new.student_id and grade is distinct from v_grade;

  return new;
end;
$$;

drop trigger if exists trg_enrollments_grade_guard on public.class_enrollments;
create trigger trg_enrollments_grade_guard
  before insert on public.class_enrollments
  for each row execute function public.check_enrollment_grade();

create or replace function public.unhide_student_on_enroll()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' then
    update public.students
    set deleted_at = null
    where id = new.student_id and deleted_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_unhide_student on public.class_enrollments;
create trigger trg_enrollments_unhide_student
  after insert on public.class_enrollments
  for each row execute function public.unhide_student_on_enroll();

create or replace function public.check_enrollment_left_at()
returns trigger language plpgsql as $$
declare
  v_today date := public.vn_today();
begin
  if new.status = 'dropped' and new.left_at is not null then
    if new.left_at > v_today then
      raise exception 'Ngày nghỉ không được ở tương lai.';
    end if;

    if exists (
      select 1 from public.attendance_records
      where enrollment_id = new.id and attendance_date > new.left_at
    ) then
      raise exception 'Học sinh đã có điểm danh sau ngày nghỉ. Hãy xóa các buổi điểm danh đó hoặc chọn ngày nghỉ muộn hơn.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_left_at_guard on public.class_enrollments;
create trigger trg_enrollments_left_at_guard
  before update of status, left_at on public.class_enrollments
  for each row execute function public.check_enrollment_left_at();

create or replace function public.hide_student_when_no_active_class()
returns trigger language plpgsql as $$
begin
  if new.status = 'dropped' and old.status = 'active' then
    if not exists (
      select 1 from public.class_enrollments
      where student_id = new.student_id and status = 'active'
    ) then
      update public.students set deleted_at = now()
      where id = new.student_id and deleted_at is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_hide_student on public.class_enrollments;
create trigger trg_enrollments_hide_student
  after update of status on public.class_enrollments
  for each row execute function public.hide_student_when_no_active_class();

-- ---------------------------------------------------------------------
-- 6. Quy tắc trên bảng Điểm danh (attendance_records):
--    - Không điểm danh Có mặt/Vắng cho ngày tương lai (Vắng có phép được phép)
--    - Ngày điểm danh phải nằm trong [joined_at, left_at]
--    - Học bù (class_id <> lớp của enrollment_id) chỉ giữa 2 lớp cùng giáo viên
-- ---------------------------------------------------------------------
create or replace function public.check_attendance_record()
returns trigger language plpgsql as $$
declare
  v_today date := public.vn_today();
  v_enr   public.class_enrollments%rowtype;
begin
  select * into v_enr from public.class_enrollments where id = new.enrollment_id;
  if not found then
    raise exception 'Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;

  if v_enr.student_id <> new.student_id then
    raise exception 'Ghi danh này không thuộc về học sinh đang điểm danh.';
  end if;

  if new.status <> 'absent_excused' and new.attendance_date > v_today then
    raise exception 'Trung tâm không điểm danh Có mặt hoặc Vắng cho ngày trong tương lai.';
  end if;

  if new.attendance_date < v_enr.joined_at then
    raise exception 'Ngày điểm danh sớm hơn ngày học sinh vào lớp (%).',
      to_char(v_enr.joined_at, 'DD/MM/YYYY');
  end if;

  if v_enr.left_at is not null and new.attendance_date > v_enr.left_at then
    raise exception 'Ngày điểm danh muộn hơn ngày học sinh nghỉ lớp (%).',
      to_char(v_enr.left_at, 'DD/MM/YYYY');
  end if;

  if v_enr.class_id <> new.class_id then
    if not exists (
      select 1
      from public.classes a
      join public.classes b on b.teacher_id = a.teacher_id
      where a.id = v_enr.class_id and b.id = new.class_id and a.teacher_id is not null
    ) then
      raise exception 'Học bù chỉ áp dụng giữa các lớp do cùng một giáo viên phụ trách.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_guard on public.attendance_records;
create trigger trg_attendance_guard
  before insert or update of enrollment_id, class_id, student_id, attendance_date, status
  on public.attendance_records
  for each row execute function public.check_attendance_record();

notify pgrst, 'reload schema';
