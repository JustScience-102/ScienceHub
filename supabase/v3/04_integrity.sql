-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 04: TOÀN VẸN DỮ LIỆU (TRIGGER)
-- Chạy sau 03_naming.sql. Chạy lại an toàn.
--
-- Nguyên tắc: trạng thái suy ra (học sinh ẩn/hiện, khối của học sinh, phụ huynh ẩn/hiện) được TÍNH LẠI
-- từ dữ liệu gốc bằng một hàm duy nhất, không bật/tắt theo từng sự kiện như V2.
-- Khi đang khôi phục từ file sao lưu (_is_restoring), các trigger kiểm tra bỏ qua.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hàm dùng chung
-- ---------------------------------------------------------------------

-- Lớp có buổi học vào ngày này không (theo lịch hiệu lực của ngày đó).
create or replace function public.class_has_session(p_class_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_schedules s
    where s.class_id = p_class_id
      and s.day_of_week = public.vn_day_of_week(p_date)
      and (s.valid_from is null or s.valid_from <= p_date)
      and (s.valid_to   is null or s.valid_to   >= p_date)
  );
$$;

create or replace function public.month_is_closed(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.month_closures m where m.month_start = public.vn_month_start(p_date));
$$;

create or replace function public._assert_month_open(p_date date)
returns void
language plpgsql
stable
as $$
begin
  if p_date is not null and public.month_is_closed(p_date) then
    raise exception 'Trung tâm: Tháng % đã chốt sổ nên không thể thêm, sửa hoặc xóa điểm danh của tháng này. Quản lý cần mở lại tháng (ghi rõ lý do) trước.',
      to_char(p_date, 'MM/YYYY');
  end if;
end;
$$;

-- Phụ huynh hiện khi còn ít nhất 1 con đang hiển thị, ngược lại tự ẩn.
create or replace function public._sync_parent_state(p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_parent_id is null then
    return;
  end if;
  if exists (select 1 from public.students s where s.parent_id = p_parent_id and s.deleted_at is null) then
    update public.parents set deleted_at = null where id = p_parent_id and deleted_at is not null;
  else
    update public.parents set deleted_at = now() where id = p_parent_id and deleted_at is null;
  end if;
end;
$$;

-- Học sinh hiện khi còn lớp đang học, tự ẩn khi đã nghỉ hết; khối = khối của các lớp đang học
-- (giữ khối cũ khi không còn lớp). Phụ huynh tự đồng bộ qua trigger của bảng students.
create or replace function public._sync_student_state(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_grade  smallint;
begin
  select count(*), max(c.grade) into v_active, v_grade
  from public.class_enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = p_student_id and e.status = 'active';

  update public.students s
  set deleted_at = case when v_active > 0 then null else coalesce(s.deleted_at, now()) end,
      grade      = coalesce(v_grade, s.grade)
  where s.id = p_student_id
    and ((v_active > 0) <> (s.deleted_at is null) or s.grade is distinct from coalesce(v_grade, s.grade));
end;
$$;

-- Học sinh không được đang học hai lớp khác khối. Trả về câu báo lỗi hoặc NULL.
create or replace function public._student_grade_conflict(p_student_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format(
           'Học sinh %s đang học các lớp khác khối (%s). Trung tâm chỉ xếp học sinh vào các lớp cùng khối.',
           s.full_name,
           string_agg(c.name || ' - khối ' || c.grade, ', ' order by c.grade, c.name)
         )
  from public.students s
  join public.class_enrollments e on e.student_id = s.id and e.status = 'active'
  join public.classes c on c.id = e.class_id
  where s.id = p_student_id
  group by s.id, s.full_name
  having count(distinct c.grade) > 1;
$$;

-- ---------------------------------------------------------------------
-- 2. Mã học sinh / phụ huynh không đổi
-- ---------------------------------------------------------------------
create or replace function public._trg_codes_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'students' and new.student_code is distinct from old.student_code then
    raise exception 'Trung tâm: Không được đổi mã học sinh.';
  end if;
  if tg_table_name = 'parents' and new.parent_code is distinct from old.parent_code then
    raise exception 'Trung tâm: Không được đổi mã phụ huynh.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_code_immutable on public.students;
create trigger trg_students_code_immutable
  before update of student_code on public.students
  for each row execute function public._trg_codes_immutable();

drop trigger if exists trg_parents_code_immutable on public.parents;
create trigger trg_parents_code_immutable
  before update of parent_code on public.parents
  for each row execute function public._trg_codes_immutable();

-- ---------------------------------------------------------------------
-- 3. Giáo viên: chỉ ẩn khi không còn lớp đang hiển thị; ẩn thì khóa tài khoản
-- ---------------------------------------------------------------------
create or replace function public._trg_teachers_guard()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  if public._is_restoring() then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    select count(*) into v_count from public.classes where teacher_id = new.id and deleted_at is null;
    if v_count > 0 then
      raise exception 'Trung tâm: Giáo viên đang phụ trách % lớp. Hãy chuyển lớp cho giáo viên khác hoặc ẩn lớp trước.', v_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teachers_guard on public.teachers;
create trigger trg_teachers_guard
  before update of deleted_at on public.teachers
  for each row execute function public._trg_teachers_guard();

create or replace function public._trg_teachers_lock_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  update public.profiles set active = false where teacher_id = new.id and active;
  return new;
end;
$$;

drop trigger if exists trg_teachers_lock_account on public.teachers;
create trigger trg_teachers_lock_account
  after update of deleted_at on public.teachers
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public._trg_teachers_lock_account();

-- ---------------------------------------------------------------------
-- 4. Lớp học
--    a) Chỉ ẩn khi không còn học sinh đang học.
--    b) Lớp đang hiển thị không được thuộc giáo viên đã ẩn.
--    c) Đổi khối: khối của học sinh tự cập nhật; kiểm tra "cùng khối" chạy lúc COMMIT (hoãn) nên
--       chuyển năm học đổi khối cả loạt lớp trong một giao dịch mà không cần nới quy tắc.
--    d) Đổi môn/khối/STT/giáo viên: lưu thời kỳ cũ vào class_versions.
-- ---------------------------------------------------------------------
create or replace function public._trg_classes_guard()
returns trigger
language plpgsql
as $$
declare
  v_teacher record;
begin
  if public._is_restoring() then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    if exists (select 1 from public.class_enrollments where class_id = new.id and status = 'active') then
      raise exception 'Trung tâm không thể ẩn lớp % khi lớp còn học sinh đang học. Hãy cho các học sinh nghỉ hoặc đổi lớp trước.', old.name;
    end if;
  end if;

  if new.deleted_at is null
     and (tg_op = 'INSERT' or new.teacher_id is distinct from old.teacher_id or old.deleted_at is not null) then
    select t.full_name, t.deleted_at into v_teacher from public.teachers t where t.id = new.teacher_id;
    if v_teacher.deleted_at is not null then
      raise exception 'Trung tâm: Giáo viên % đang bị ẩn. Hãy khôi phục giáo viên đó hoặc chọn giáo viên khác cho lớp.', v_teacher.full_name;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_classes_guard on public.classes;
create trigger trg_classes_guard
  before insert or update of deleted_at, teacher_id on public.classes
  for each row execute function public._trg_classes_guard();

create or replace function public._trg_classes_grade_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if public._is_restoring() then
    return new;
  end if;
  for r in select e.student_id from public.class_enrollments e where e.class_id = new.id and e.status = 'active' loop
    perform public._sync_student_state(r.student_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_classes_grade_sync on public.classes;
create trigger trg_classes_grade_sync
  after update of grade on public.classes
  for each row
  when (old.grade is distinct from new.grade)
  execute function public._trg_classes_grade_sync();

create or replace function public._trg_classes_grade_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  v_msg text;
begin
  if public._is_restoring() then
    return null;
  end if;
  for r in select e.student_id from public.class_enrollments e where e.class_id = new.id and e.status = 'active' loop
    v_msg := public._student_grade_conflict(r.student_id);
    if v_msg is not null then
      raise exception 'Trung tâm: Không thể đổi lớp % sang khối %. %', new.name, new.grade, v_msg;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_classes_grade_check on public.classes;
create constraint trigger trg_classes_grade_check
  after update of grade on public.classes
  deferrable initially deferred
  for each row
  execute function public._trg_classes_grade_check();

-- Thời kỳ cũ: từ ngày bắt đầu (ngày tạo lớp hoặc ngày sau thời kỳ trước) đến NGÀY TRƯỚC ngày thay đổi.
-- Ngày thay đổi mặc định là hôm nay; chuyển năm học đặt theo ngày chuyển (biến cục bộ giao dịch).
create or replace function public._trg_class_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change date := coalesce(nullif(current_setting('sciencehub.class_change_date', true), '')::date, public.vn_today());
  v_reason text := case when current_setting('sciencehub.class_change_reason', true) = 'year_rollover'
                        then 'year_rollover' else 'edit' end;
  v_from   date;
begin
  if public._is_restoring() then
    return new;
  end if;

  select coalesce(max(v.valid_to) + 1, (old.created_at at time zone 'Asia/Ho_Chi_Minh')::date)
    into v_from
  from public.class_versions v
  where v.class_id = old.id;

  if v_from <= v_change - 1 then
    insert into public.class_versions (
      class_id, subject, grade, class_no, teacher_id, price_per_session, valid_from, valid_to, reason
    ) values (
      old.id, old.subject, old.grade, old.class_no, old.teacher_id, old.price_per_session,
      v_from, v_change - 1, v_reason
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_class_versions on public.classes;
create trigger trg_class_versions
  after update of subject, grade, class_no, teacher_id on public.classes
  for each row
  when ((old.subject, old.grade, old.class_no, old.teacher_id)
        is distinct from (new.subject, new.grade, new.class_no, new.teacher_id))
  execute function public._trg_class_versions();

-- class_versions: chỉ thêm. Xóa chỉ được khi đang khôi phục từ file sao lưu.
create or replace function public._trg_class_versions_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public._is_restoring() then
    return old;
  end if;
  raise exception 'Trung tâm: Lịch sử nhãn lớp học được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa.';
end;
$$;

drop trigger if exists trg_class_versions_immutable on public.class_versions;
create trigger trg_class_versions_immutable
  before update or delete on public.class_versions
  for each row execute function public._trg_class_versions_immutable();

drop trigger if exists trg_class_versions_no_truncate on public.class_versions;
create trigger trg_class_versions_no_truncate
  before truncate on public.class_versions
  for each statement execute function public._trg_class_versions_immutable();

-- ---------------------------------------------------------------------
-- 5. Lịch học theo thời kỳ: mỗi lớp mỗi thứ không có hai thời kỳ chồng nhau
-- ---------------------------------------------------------------------
create or replace function public._trg_schedules_no_overlap()
returns trigger
language plpgsql
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  if exists (
    select 1 from public.class_schedules s
    where s.class_id = new.class_id
      and s.day_of_week = new.day_of_week
      and s.id <> new.id
      and coalesce(s.valid_from, '-infinity'::date) <= coalesce(new.valid_to, 'infinity'::date)
      and coalesce(new.valid_from, '-infinity'::date) <= coalesce(s.valid_to, 'infinity'::date)
  ) then
    raise exception 'Trung tâm: Lịch học của lớp bị chồng thời kỳ ở cùng một thứ trong tuần.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_schedules_no_overlap on public.class_schedules;
create trigger trg_schedules_no_overlap
  before insert or update on public.class_schedules
  for each row execute function public._trg_schedules_no_overlap();

-- ---------------------------------------------------------------------
-- 6. Ghi danh
--    a) Thêm: chỉ trạng thái 'active', lớp đang hiển thị, ngày vào lớp không ở tương lai, cùng khối.
--       Khóa dòng học sinh để hai lần ghi danh đồng thời không lọt quy tắc cùng khối.
--    b) Sửa: chỉ được chuyển 'active' -> 'dropped' (không mở lại, không đổi lớp/học sinh/ngày vào).
--    c) Sau khi thêm/sửa: tính lại trạng thái học sinh.
-- ---------------------------------------------------------------------
create or replace function public._trg_enrollments_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_class public.classes%rowtype;
  v_msg   text;
begin
  if public._is_restoring() then
    return new;
  end if;

  if new.status <> 'active' then
    raise exception 'Trung tâm: Ghi danh mới phải ở trạng thái đang học.';
  end if;

  perform 1 from public.students where id = new.student_id for update;
  select * into v_class from public.classes where id = new.class_id for share;
  if v_class.deleted_at is not null then
    raise exception 'Trung tâm: Lớp % đã bị ẩn. Hãy khôi phục lớp trước khi thêm học sinh.', v_class.name;
  end if;
  if new.joined_at > public.vn_today() then
    raise exception 'Trung tâm: Ngày vào lớp không được ở tương lai.';
  end if;
  if exists (
    select 1 from public.class_enrollments
    where student_id = new.student_id and class_id = new.class_id and status = 'active'
  ) then
    raise exception 'Trung tâm: Học sinh này đang học lớp % rồi.', v_class.name;
  end if;

  select format('Học sinh %s đang học lớp %s (khối %s), không thể thêm vào lớp %s (khối %s). Trung tâm chỉ xếp học sinh vào các lớp cùng khối.',
                s.full_name, c.name, c.grade, v_class.name, v_class.grade)
    into v_msg
  from public.class_enrollments e
  join public.classes c on c.id = e.class_id
  join public.students s on s.id = e.student_id
  where e.student_id = new.student_id and e.status = 'active' and c.grade <> v_class.grade
  limit 1;
  if v_msg is not null then
    raise exception 'Trung tâm: %', v_msg;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrollments_before_insert on public.class_enrollments;
create trigger trg_enrollments_before_insert
  before insert on public.class_enrollments
  for each row execute function public._trg_enrollments_before_insert();

create or replace function public._trg_enrollments_before_update()
returns trigger
language plpgsql
as $$
begin
  if public._is_restoring() then
    return new;
  end if;

  if old.status = 'dropped' then
    raise exception 'Trung tâm: Ghi danh này đã kết thúc nên không sửa được. Muốn học lại, hãy ghi danh mới.';
  end if;
  if new.class_id is distinct from old.class_id or new.student_id is distinct from old.student_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'Trung tâm: Không được sửa lớp, học sinh hoặc ngày vào lớp của một ghi danh.';
  end if;

  if new.status = 'dropped' then
    if new.left_at > public.vn_today() then
      raise exception 'Trung tâm: Ngày nghỉ không được ở tương lai.';
    end if;
    if exists (
      select 1 from public.attendance_records
      where enrollment_id = new.id and attendance_date > new.left_at
    ) then
      raise exception 'Trung tâm: Học sinh đã có điểm danh sau ngày nghỉ. Hãy xóa các buổi điểm danh đó hoặc chọn ngày nghỉ muộn hơn.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrollments_before_update on public.class_enrollments;
create trigger trg_enrollments_before_update
  before update on public.class_enrollments
  for each row execute function public._trg_enrollments_before_update();

create or replace function public._trg_enrollments_sync_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  perform public._sync_student_state(new.student_id);
  return new;
end;
$$;

drop trigger if exists trg_enrollments_sync_student on public.class_enrollments;
create trigger trg_enrollments_sync_student
  after insert or update of status on public.class_enrollments
  for each row execute function public._trg_enrollments_sync_student();

-- ---------------------------------------------------------------------
-- 7. Học sinh: đổi phụ huynh hoặc ẩn/hiện thì đồng bộ phụ huynh cũ và mới
-- ---------------------------------------------------------------------
create or replace function public._trg_students_sync_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  perform public._sync_parent_state(new.parent_id);
  if tg_op = 'UPDATE' and old.parent_id is distinct from new.parent_id then
    perform public._sync_parent_state(old.parent_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_sync_parent on public.students;
create trigger trg_students_sync_parent
  after insert or update of parent_id, deleted_at on public.students
  for each row execute function public._trg_students_sync_parent();

-- ---------------------------------------------------------------------
-- 8. Điểm danh
--    * Tháng đã chốt sổ: không thêm/sửa/xóa.
--    * Không đổi học sinh, lớp, ghi danh, ngày, liên kết học bù của bản ghi đã có.
--    * Đơn giá đóng băng: đổi Có mặt <-> Vắng giữ nguyên price_snapshot.
--    * Thêm mới: đúng học sinh của ghi danh, trong khoảng [ngày vào, ngày nghỉ], Có mặt/Vắng không ở
--      tương lai, đúng lịch học hiệu lực của ngày đó. Bản ghi ở lớp khác lớp của ghi danh là học bù:
--      phải có makeup_of_date, là Có mặt, và hai lớp cùng một giáo viên.
-- ---------------------------------------------------------------------
create or replace function public._trg_attendance_guard()
returns trigger
language plpgsql
as $$
declare
  v_enr     public.class_enrollments%rowtype;
  v_teacher uuid;
  v_other   uuid;
begin
  if public._is_restoring() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    perform public._assert_month_open(old.attendance_date);
    return old;
  end if;

  perform public._assert_month_open(new.attendance_date);

  if tg_op = 'UPDATE' then
    if (new.enrollment_id, new.class_id, new.student_id, new.attendance_date, new.makeup_of_date)
       is distinct from (old.enrollment_id, old.class_id, old.student_id, old.attendance_date, old.makeup_of_date) then
      raise exception 'Trung tâm: Không được đổi học sinh, lớp hoặc ngày của một buổi điểm danh đã có.';
    end if;
    if old.status in ('present', 'absent') and new.status in ('present', 'absent')
       and new.price_snapshot is distinct from old.price_snapshot then
      raise exception 'Trung tâm không cho sửa đơn giá đã đóng băng của buổi học (%).', public._fmt_vnd(old.price_snapshot);
    end if;
    if new.status <> 'absent_excused' and new.attendance_date > public.vn_today() then
      raise exception 'Trung tâm không điểm danh Có mặt hoặc Vắng cho ngày trong tương lai.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  select * into v_enr from public.class_enrollments where id = new.enrollment_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;
  if v_enr.student_id <> new.student_id then
    raise exception 'Trung tâm: Ghi danh này không thuộc về học sinh đang điểm danh.';
  end if;
  if new.status <> 'absent_excused' and new.attendance_date > public.vn_today() then
    raise exception 'Trung tâm không điểm danh Có mặt hoặc Vắng cho ngày trong tương lai.';
  end if;
  if new.attendance_date < v_enr.joined_at then
    raise exception 'Trung tâm: Ngày điểm danh sớm hơn ngày học sinh vào lớp (%).', public._fmt_date(v_enr.joined_at);
  end if;
  if v_enr.left_at is not null and new.attendance_date > v_enr.left_at then
    raise exception 'Trung tâm: Ngày điểm danh muộn hơn ngày học sinh nghỉ lớp (%).', public._fmt_date(v_enr.left_at);
  end if;

  if new.class_id <> v_enr.class_id then
    if new.makeup_of_date is null or new.status <> 'present' then
      raise exception 'Trung tâm: Học sinh học bù phải được ghi bằng nút "Học bù".';
    end if;
    select teacher_id into v_teacher from public.classes where id = v_enr.class_id;
    select teacher_id into v_other   from public.classes where id = new.class_id;
    if v_teacher is distinct from v_other then
      raise exception 'Trung tâm: Học bù chỉ áp dụng giữa các lớp do cùng một giáo viên phụ trách.';
    end if;
  elsif new.makeup_of_date is not null then
    raise exception 'Trung tâm: Buổi học bù phải ở lớp khác lớp gốc của học sinh.';
  end if;

  if not public.class_has_session(new.class_id, new.attendance_date) then
    raise exception 'Trung tâm: Ngày % không nằm trong lịch học của lớp %.',
      public._fmt_date(new.attendance_date), (select name from public.classes where id = new.class_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_guard on public.attendance_records;
create trigger trg_attendance_guard
  before insert or update or delete on public.attendance_records
  for each row execute function public._trg_attendance_guard();
