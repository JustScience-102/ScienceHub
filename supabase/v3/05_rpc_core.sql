-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 05: RPC NGHIỆP VỤ (LỚP, HỌC SINH, GHI DANH, ĐIỂM DANH, THỐNG KÊ)
-- Chạy sau 04_integrity.sql. Chạy lại an toàn.
-- Mọi RPC là SECURITY DEFINER + search_path cố định, tự kiểm vai trò ở đầu hàm:
--   Quản lý toàn quyền; Giáo viên chỉ với lớp của mình và trong tháng hiện tại (như V2).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Hàm phụ
-- ---------------------------------------------------------------------
create or replace function public._assert_phone(p_phone text, p_label text)
returns void
language plpgsql
immutable
as $$
begin
  if p_phone is not null and p_phone !~ '^0[0-9]{9}$' then
    raise exception 'Trung tâm: % "%" chưa đúng (cần 10 chữ số, bắt đầu bằng 0).', p_label, p_phone;
  end if;
end;
$$;

-- Lịch hiện hành của lớp dạng '2|17:30|19:00;4|17:30|19:00' (để so sánh và ghi nhật ký).
create or replace function public._schedule_snapshot(p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(string_agg(
           s.day_of_week::text || '|' || to_char(s.start_time, 'HH24:MI') || '|' || to_char(s.end_time, 'HH24:MI'),
           ';' order by s.day_of_week), '')
  from public.class_schedules s
  where s.class_id = p_class_id and s.valid_to is null;
$$;

-- '2|17:30|19:00;8|08:00|10:00' -> 'T2 17:30–19:00, CN 08:00–10:00'
create or replace function public._schedule_label(p_snap text)
returns text
language sql
immutable
as $$
  select coalesce(
    string_agg(
      case split_part(x, '|', 1) when '8' then 'CN' else 'T' || split_part(x, '|', 1) end
        || ' ' || split_part(x, '|', 2) || '–' || split_part(x, '|', 3),
      ', ' order by split_part(x, '|', 1)::integer
    ),
    'Chưa có lịch'
  )
  from regexp_split_to_table(coalesce(p_snap, ''), ';') as x
  where x <> '';
$$;

-- ---------------------------------------------------------------------
-- 1. Lớp học
-- ---------------------------------------------------------------------

-- Thêm/sửa lớp + lịch học trong một giao dịch. Tên lớp do Database đặt.
--   p_class_no NULL: tự chọn STT nhỏ nhất còn trống (sửa lớp mà không đổi môn/khối/GV thì giữ STT cũ).
--   p_schedule: [{day, start, end}]. Khi sửa mà lịch thay đổi, lịch mới áp dụng từ p_schedule_from
--   (mặc định hôm nay); lịch cũ vẫn dùng để kiểm điểm danh của các ngày trước đó.
-- Trả về {id, name, class_no, schedule_changed, schedule_from, mismatched_sessions}.
create or replace function public.save_class(
  p_class_id      uuid,
  p_subject       text,
  p_grade         integer,
  p_class_no      integer,
  p_teacher_id    uuid,
  p_price         integer,
  p_schedule      jsonb,
  p_schedule_from date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.assert_staff();
  v_me        uuid := public.current_teacher_id();
  v_subject   text := btrim(coalesce(p_subject, ''));
  v_old       public.classes%rowtype;
  v_id        uuid;
  v_no        integer;
  v_other     text;
  v_item      jsonb;
  v_day       integer;
  v_start     time;
  v_end       time;
  v_days      integer[] := '{}';
  v_new_snap  text;
  v_old_snap  text;
  v_from      date;
  v_cur_from  date;
  v_changed   boolean := false;
  v_mismatch  integer := 0;
  v_name      text;
begin
  if v_role = 'teacher' then
    if p_teacher_id is distinct from v_me then
      raise exception 'Trung tâm: Giáo viên chỉ được tạo hoặc chỉnh sửa lớp của chính mình, không thể chuyển lớp cho giáo viên khác.';
    end if;
    if p_class_id is not null and not exists (
      select 1 from public.classes c where c.id = p_class_id and c.teacher_id = v_me
    ) then
      raise exception 'Trung tâm: Bạn không có quyền chỉnh sửa lớp của giáo viên khác.';
    end if;
  end if;

  if v_subject = '' then
    raise exception 'Trung tâm: Vui lòng chọn môn học.';
  end if;
  if p_grade is null or p_grade not between 1 and 12 then
    raise exception 'Trung tâm: Vui lòng chọn khối lớp từ 1 đến 12.';
  end if;
  if p_teacher_id is null or not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'Trung tâm: Vui lòng chọn giáo viên phụ trách.';
  end if;
  if p_class_no is not null and p_class_no < 1 then
    raise exception 'Trung tâm: Số thứ tự lớp phải từ 1 trở lên.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Trung tâm: Đơn giá phải là số nguyên từ 0 trở lên.';
  end if;
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) = 0 then
    raise exception 'Trung tâm: Vui lòng chọn ít nhất một ngày học trong tuần.';
  end if;

  for v_item in select value from jsonb_array_elements(p_schedule) loop
    begin
      v_day   := (v_item->>'day')::integer;
      v_start := (v_item->>'start')::time;
      v_end   := (v_item->>'end')::time;
    exception when others then
      raise exception 'Trung tâm: Lịch học không hợp lệ, hãy kiểm tra lại thứ và giờ học.';
    end;
    if v_day is null or v_day not between 2 and 8 then
      raise exception 'Trung tâm: Ngày học trong tuần không hợp lệ.';
    end if;
    if v_start is null or v_end is null then
      raise exception 'Trung tâm: Vui lòng nhập giờ bắt đầu và giờ kết thúc cho từng ngày học.';
    end if;
    if v_end <= v_start then
      raise exception 'Trung tâm: Giờ kết thúc phải sau giờ bắt đầu.';
    end if;
    if v_day = any (v_days) then
      raise exception 'Trung tâm: Mỗi ngày trong tuần chỉ được có một khung giờ.';
    end if;
    v_days := v_days || v_day;
  end loop;

  select coalesce(string_agg(
           (x->>'day')::integer::text || '|' || to_char((x->>'start')::time, 'HH24:MI') || '|' || to_char((x->>'end')::time, 'HH24:MI'),
           ';' order by (x->>'day')::integer), '')
    into v_new_snap
  from jsonb_array_elements(p_schedule) x;

  if p_class_id is not null then
    select * into v_old from public.classes where id = p_class_id for update;
    if not found then
      raise exception 'Trung tâm: Không tìm thấy lớp.';
    end if;
    if v_old.deleted_at is not null then
      raise exception 'Trung tâm: Lớp % đang bị ẩn. Hãy khôi phục lớp trước khi sửa.', v_old.name;
    end if;
  end if;

  if p_class_no is not null then
    v_no := p_class_no;
  elsif p_class_id is not null and v_old.subject = v_subject and v_old.grade = p_grade
        and v_old.teacher_id = p_teacher_id then
    v_no := v_old.class_no;
  else
    v_no := public._next_class_no(v_subject, p_grade, p_teacher_id, p_class_id);
  end if;

  select c.name into v_other
  from public.classes c
  where c.deleted_at is null and c.subject = v_subject and c.grade = p_grade
    and c.teacher_id = p_teacher_id and c.class_no = v_no
    and (p_class_id is null or c.id <> p_class_id);
  if v_other is not null then
    raise exception 'Trung tâm: STT % đã được dùng bởi lớp %. Hãy chọn STT khác.', v_no, v_other;
  end if;

  if p_class_id is null then
    insert into public.classes (subject, grade, class_no, teacher_id, price_per_session)
    values (v_subject, p_grade, v_no, p_teacher_id, p_price)
    returning id into v_id;

    insert into public.class_schedules (class_id, day_of_week, start_time, end_time)
    select v_id, (x->>'day')::integer, (x->>'start')::time, (x->>'end')::time
    from jsonb_array_elements(p_schedule) x;
  else
    v_id := p_class_id;
    update public.classes
    set subject = v_subject, grade = p_grade, class_no = v_no, teacher_id = p_teacher_id,
        price_per_session = p_price
    where id = v_id;

    v_old_snap := public._schedule_snapshot(v_id);
    if v_old_snap <> v_new_snap then
      v_changed := true;
      v_from := coalesce(p_schedule_from, public.vn_today());
      if v_role = 'teacher' and v_from < public.vn_month_start() then
        raise exception 'Trung tâm: Giáo viên chỉ được áp dụng lịch mới từ một ngày trong tháng hiện tại trở đi.';
      end if;

      select max(s.valid_from) into v_cur_from
      from public.class_schedules s
      where s.class_id = v_id and s.valid_to is null;

      if v_cur_from is not null and v_from < v_cur_from then
        raise exception 'Trung tâm: Lịch hiện tại của lớp bắt đầu từ ngày %, nên lịch mới phải áp dụng từ ngày đó trở đi.',
          public._fmt_date(v_cur_from);
      end if;

      if v_cur_from is not null and v_from = v_cur_from then
        -- Sửa lại lịch đặt cùng ngày bắt đầu: thay hẳn các khung giờ của thời kỳ đó.
        delete from public.class_schedules where class_id = v_id and valid_to is null;
      else
        update public.class_schedules set valid_to = v_from - 1 where class_id = v_id and valid_to is null;
      end if;

      insert into public.class_schedules (class_id, day_of_week, start_time, end_time, valid_from)
      select v_id, (x->>'day')::integer, (x->>'start')::time, (x->>'end')::time, v_from
      from jsonb_array_elements(p_schedule) x;

      select count(*) into v_mismatch
      from public.attendance_records a
      where a.class_id = v_id and a.attendance_date >= v_from
        and not public.class_has_session(v_id, a.attendance_date);

      select c.name into v_name from public.classes c where c.id = v_id;
      perform public._write_audit_log(
        'class_schedule_update', 'class_schedules', v_id, v_id, null,
        format('Đổi lịch học lớp %s từ ngày %s: %s -> %s', v_name, public._fmt_date(v_from),
               public._schedule_label(v_old_snap), public._schedule_label(v_new_snap)),
        jsonb_build_object('class_name', v_name, 'schedule', public._schedule_label(v_old_snap)),
        jsonb_build_object('class_name', v_name, 'schedule', public._schedule_label(v_new_snap), 'valid_from', v_from)
      );
    end if;
  end if;

  select c.name into v_name from public.classes c where c.id = v_id;
  return jsonb_build_object(
    'id', v_id, 'name', v_name, 'class_no', v_no,
    'schedule_changed', v_changed, 'schedule_from', v_from, 'mismatched_sessions', v_mismatch
  );
end;
$$;

-- Ẩn / khôi phục lớp. Khi khôi phục: Quản lý có thể đổi giáo viên (p_teacher_id); STT giữ nguyên nếu còn
-- trống, không thì tự lấy số nhỏ nhất còn trống. Trả về {id, name, class_no, hidden}.
create or replace function public.set_class_hidden(
  p_class_id   uuid,
  p_hidden     boolean,
  p_teacher_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.assert_staff();
  v_class   public.classes%rowtype;
  v_teacher uuid;
  v_no      integer;
begin
  if p_hidden is null then
    raise exception 'Trung tâm: Vui lòng chọn ẩn hoặc khôi phục lớp.';
  end if;

  select * into v_class from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;
  if v_role = 'teacher' then
    if v_class.teacher_id is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn không có quyền chỉnh sửa lớp của giáo viên khác.';
    end if;
    if p_teacher_id is not null and p_teacher_id is distinct from v_class.teacher_id then
      raise exception 'Trung tâm: Giáo viên không thể chuyển lớp cho giáo viên khác.';
    end if;
  end if;

  if p_hidden then
    if v_class.deleted_at is null then
      update public.classes set deleted_at = now() where id = p_class_id;
    end if;
  elsif v_class.deleted_at is not null then
    v_teacher := coalesce(p_teacher_id, v_class.teacher_id);
    if not exists (select 1 from public.teachers where id = v_teacher) then
      raise exception 'Trung tâm: Không tìm thấy giáo viên đã chọn.';
    end if;
    v_no := v_class.class_no;
    if exists (
      select 1 from public.classes c
      where c.deleted_at is null and c.id <> p_class_id and c.subject = v_class.subject
        and c.grade = v_class.grade and c.teacher_id = v_teacher and c.class_no = v_no
    ) then
      v_no := public._next_class_no(v_class.subject, v_class.grade, v_teacher, p_class_id);
    end if;
    update public.classes set deleted_at = null, teacher_id = v_teacher, class_no = v_no where id = p_class_id;
  end if;

  select * into v_class from public.classes where id = p_class_id;
  return jsonb_build_object('id', v_class.id, 'name', v_class.name, 'class_no', v_class.class_no,
                            'hidden', v_class.deleted_at is not null);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Học sinh & phụ huynh
-- ---------------------------------------------------------------------

-- Tạo học sinh + gắn/tạo phụ huynh theo SĐT + ghi danh vào lớp. Phụ huynh đã có thì dùng lại, không sửa tên.
create or replace function public.register_student_in_class(
  p_class_id     uuid,
  p_joined_at    date,
  p_full_name    text,
  p_phone        text,
  p_parent_name  text,
  p_parent_phone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role         text := public.assert_staff();
  v_joined       date := coalesce(p_joined_at, public.vn_today());
  v_name         text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone        text := nullif(btrim(coalesce(p_phone, '')), '');
  v_parent_name  text := regexp_replace(btrim(coalesce(p_parent_name, '')), '\s+', ' ', 'g');
  v_parent_phone text := btrim(coalesce(p_parent_phone, ''));
  v_owner        uuid;
  v_parent_id    uuid;
  v_student_id   uuid;
begin
  if p_class_id is null then
    raise exception 'Trung tâm: Vui lòng chọn lớp cho học sinh.';
  end if;
  select c.teacher_id into v_owner from public.classes c where c.id = p_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;
  if v_role = 'teacher' then
    if v_owner is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn chỉ được thêm học sinh vào lớp do mình phụ trách.';
    end if;
    if v_joined < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi danh học sinh với ngày vào lớp nằm trong tháng hiện tại.';
    end if;
  end if;

  if v_name = '' then
    raise exception 'Trung tâm: Vui lòng nhập họ tên học sinh.';
  end if;
  if v_parent_phone = '' then
    raise exception 'Trung tâm: Vui lòng nhập số điện thoại phụ huynh.';
  end if;
  perform public._assert_phone(v_parent_phone, 'SĐT phụ huynh');
  perform public._assert_phone(v_phone, 'SĐT học sinh');
  if v_phone is not null and exists (select 1 from public.students where phone = v_phone) then
    raise exception 'Trung tâm: SĐT học sinh % đã thuộc về một học sinh khác.', v_phone;
  end if;

  select id into v_parent_id from public.parents where phone = v_parent_phone;
  if v_parent_id is null then
    if v_parent_name = '' then
      raise exception 'Trung tâm: Vui lòng nhập họ tên phụ huynh.';
    end if;
    insert into public.parents (full_name, phone) values (v_parent_name, v_parent_phone)
    returning id into v_parent_id;
  end if;

  insert into public.students (full_name, phone, parent_id) values (v_name, v_phone, v_parent_id)
  returning id into v_student_id;

  insert into public.class_enrollments (class_id, student_id, joined_at) values (p_class_id, v_student_id, v_joined);

  return v_student_id;
end;
$$;

-- Sửa học sinh kèm phụ huynh.
--   SĐT phụ huynh đã có: gắn học sinh vào phụ huynh đó (Quản lý được sửa tên nếu là phụ huynh hiện tại).
--   SĐT chưa có: phụ huynh hiện tại chỉ có đúng 1 con thì đổi SĐT phụ huynh đó (Giáo viên giữ tên,
--   Quản lý đổi cả tên); ngược lại tạo phụ huynh mới (cần họ tên).
--   Giáo viên chỉ sửa học sinh đang học lớp mình và không được đổi tên phụ huynh.
create or replace function public.update_student(
  p_student_id   uuid,
  p_full_name    text,
  p_phone        text,
  p_parent_name  text,
  p_parent_phone text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role           text := public.assert_staff();
  v_name           text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone          text := nullif(btrim(coalesce(p_phone, '')), '');
  v_parent_name    text := regexp_replace(btrim(coalesce(p_parent_name, '')), '\s+', ' ', 'g');
  v_parent_phone   text := btrim(coalesce(p_parent_phone, ''));
  v_current_parent uuid;
  v_found_parent   uuid;
  v_new_parent     uuid;
  v_child_count    integer;
begin
  if v_name = '' then
    raise exception 'Trung tâm: Vui lòng nhập họ tên học sinh.';
  end if;
  if v_parent_phone = '' then
    raise exception 'Trung tâm: Vui lòng nhập số điện thoại phụ huynh.';
  end if;
  perform public._assert_phone(v_parent_phone, 'SĐT phụ huynh');
  perform public._assert_phone(v_phone, 'SĐT học sinh');

  select parent_id into v_current_parent from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy học sinh.';
  end if;

  if v_role = 'teacher' and not exists (
    select 1 from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where ce.student_id = p_student_id and ce.status = 'active' and c.teacher_id = public.current_teacher_id()
  ) then
    raise exception 'Trung tâm: Bạn chỉ được chỉnh sửa thông tin học sinh đang học lớp mình phụ trách.';
  end if;

  if v_phone is not null and exists (select 1 from public.students where phone = v_phone and id <> p_student_id) then
    raise exception 'Trung tâm: SĐT học sinh % đã thuộc về một học sinh khác.', v_phone;
  end if;

  select id into v_found_parent from public.parents where phone = v_parent_phone;

  if v_found_parent is not null then
    v_new_parent := v_found_parent;
    if v_role = 'manager' and v_found_parent = v_current_parent and v_parent_name <> '' then
      update public.parents set full_name = v_parent_name where id = v_found_parent and full_name <> v_parent_name;
    end if;
  else
    select count(*) into v_child_count from public.students where parent_id = v_current_parent;

    if v_current_parent is not null and v_child_count = 1 and v_role = 'teacher' then
      update public.parents set phone = v_parent_phone where id = v_current_parent;
      v_new_parent := v_current_parent;
    else
      if v_parent_name = '' then
        raise exception 'Trung tâm: Vui lòng nhập họ tên phụ huynh.';
      end if;
      if v_current_parent is not null and v_child_count = 1 then
        update public.parents set full_name = v_parent_name, phone = v_parent_phone where id = v_current_parent;
        v_new_parent := v_current_parent;
      else
        insert into public.parents (full_name, phone) values (v_parent_name, v_parent_phone)
        returning id into v_new_parent;
      end if;
    end if;
  end if;

  update public.students
  set full_name = v_name, phone = v_phone, parent_id = v_new_parent
  where id = p_student_id
    and (full_name, phone, parent_id) is distinct from (v_name, v_phone, v_new_parent);
end;
$$;

-- Tra phụ huynh theo SĐT: chỉ khớp chính xác 10 số (chống dò danh sách). Giáo viên chỉ nhận class_ids của lớp mình.
create or replace function public.lookup_parent_by_phone(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role     text := public.assert_staff();
  v_teacher  uuid := public.current_teacher_id();
  v_phone    text := btrim(coalesce(p_phone, ''));
  v_parent   public.parents%rowtype;
  v_students jsonb;
begin
  if v_phone !~ '^0[0-9]{9}$' then
    return null;
  end if;

  select * into v_parent from public.parents where phone = v_phone;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'student_code', s.student_code, 'full_name', s.full_name, 'phone', s.phone,
           'grade', s.grade, 'deleted_at', s.deleted_at,
           'active_class_count', (select count(*) from public.class_enrollments e
                                  where e.student_id = s.id and e.status = 'active'),
           'class_ids', (select coalesce(jsonb_agg(e.class_id), '[]'::jsonb)
                         from public.class_enrollments e
                         join public.classes c on c.id = e.class_id
                         where e.student_id = s.id and e.status = 'active'
                           and (v_role = 'manager' or c.teacher_id = v_teacher))
         ) order by s.full_name, s.student_code), '[]'::jsonb)
    into v_students
  from public.students s
  where s.parent_id = v_parent.id;

  return jsonb_build_object(
    'id', v_parent.id, 'parent_code', v_parent.parent_code, 'full_name', v_parent.full_name,
    'phone', v_parent.phone, 'deleted_at', v_parent.deleted_at, 'students', v_students
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Ghi danh, cho nghỉ, đổi lớp
-- ---------------------------------------------------------------------
create or replace function public.enroll_existing_student(
  p_class_id   uuid,
  p_student_id uuid,
  p_joined_at  date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.assert_staff();
  v_owner  uuid;
  v_joined date := coalesce(p_joined_at, public.vn_today());
  v_id     uuid;
begin
  if p_class_id is null then
    raise exception 'Trung tâm: Vui lòng chọn lớp.';
  end if;
  if p_student_id is null or not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Trung tâm: Không tìm thấy học sinh.';
  end if;
  select c.teacher_id into v_owner from public.classes c where c.id = p_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;
  if v_role = 'teacher' then
    if v_owner is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn chỉ được thêm học sinh vào lớp do mình phụ trách.';
    end if;
    if v_joined < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi danh học sinh với ngày vào lớp nằm trong tháng hiện tại.';
    end if;
  end if;

  insert into public.class_enrollments (class_id, student_id, joined_at)
  values (p_class_id, p_student_id, v_joined)
  returning id into v_id;
  return v_id;
end;
$$;

-- Hủy một buổi học bù (nội bộ): xóa buổi bù, trả buổi gốc về đúng trạng thái/giá trước khi bù
-- (buổi gốc do việc bù tạo ra thì xóa). Buổi gốc không còn (đã xóa khi cho nghỉ) thì bỏ qua.
create or replace function public._undo_makeup(p_makeup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.attendance_records%rowtype;
  v_enr public.class_enrollments%rowtype;
begin
  select * into v_rec from public.attendance_records where id = p_makeup_id for update;
  if not found or v_rec.makeup_of_date is null then
    raise exception 'Trung tâm: Không tìm thấy buổi học bù.';
  end if;
  select * into v_enr from public.class_enrollments where id = v_rec.enrollment_id;

  delete from public.attendance_records where id = p_makeup_id;

  if v_rec.makeup_prev_status is null then
    delete from public.attendance_records
    where class_id = v_enr.class_id and student_id = v_rec.student_id and attendance_date = v_rec.makeup_of_date;
  else
    update public.attendance_records
    set status = v_rec.makeup_prev_status, price_snapshot = v_rec.makeup_prev_price
    where class_id = v_enr.class_id and student_id = v_rec.student_id and attendance_date = v_rec.makeup_of_date
      and (status, price_snapshot) is distinct from (v_rec.makeup_prev_status, v_rec.makeup_prev_price);
  end if;
end;
$$;

-- Lõi cho nghỉ (nội bộ). Có điểm danh sau ngày nghỉ thì phải xác nhận xóa (p_delete_attendance);
-- buổi học bù bị xóa thì buổi gốc được trả lại như trước khi bù.
create or replace function public._drop_enrollment_core(
  p_enrollment_id     uuid,
  p_left_at           date,
  p_delete_attendance boolean,
  p_reason            text,
  p_transfer_to       uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enr   public.class_enrollments%rowtype;
  v_later integer;
  r       record;
begin
  select * into v_enr from public.class_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;
  if v_enr.status <> 'active' then
    raise exception 'Trung tâm: Học sinh này đã nghỉ khỏi lớp trước đó.';
  end if;
  if p_left_at is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày nghỉ.';
  end if;
  if p_left_at < v_enr.joined_at then
    raise exception 'Trung tâm: Ngày nghỉ không được sớm hơn ngày vào lớp (%).', public._fmt_date(v_enr.joined_at);
  end if;
  if p_left_at > public.vn_today() then
    raise exception 'Trung tâm: Ngày nghỉ không được ở tương lai.';
  end if;

  select count(*) into v_later
  from public.attendance_records
  where enrollment_id = p_enrollment_id and attendance_date > p_left_at;

  if v_later > 0 then
    if not coalesce(p_delete_attendance, false) then
      raise exception 'Trung tâm: Học sinh có % buổi điểm danh sau ngày nghỉ. Hãy xác nhận xóa các buổi đó hoặc chọn ngày nghỉ muộn hơn.', v_later;
    end if;
    for r in
      select id from public.attendance_records
      where enrollment_id = p_enrollment_id and attendance_date > p_left_at and makeup_of_date is not null
    loop
      perform public._undo_makeup(r.id);
    end loop;
    delete from public.attendance_records where enrollment_id = p_enrollment_id and attendance_date > p_left_at;
  end if;

  update public.class_enrollments
  set status = 'dropped', left_at = p_left_at, left_reason = p_reason, transfer_to_id = p_transfer_to
  where id = p_enrollment_id;

  return v_later;
end;
$$;

-- Cho nghỉ (nghỉ hẳn khỏi lớp). Giáo viên: lớp mình, ngày nghỉ trong tháng hiện tại.
create or replace function public.drop_enrollment(
  p_enrollment_id     uuid,
  p_left_at           date,
  p_delete_attendance boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.assert_staff();
begin
  if v_role = 'teacher' then
    if not exists (
      select 1 from public.class_enrollments e join public.classes c on c.id = e.class_id
      where e.id = p_enrollment_id and c.teacher_id = public.current_teacher_id()
    ) then
      raise exception 'Trung tâm: Bạn chỉ được cho nghỉ học sinh ở lớp do mình phụ trách.';
    end if;
    if coalesce(p_left_at, public.vn_today()) < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được cho học sinh nghỉ với ngày nghỉ nằm trong tháng hiện tại.';
    end if;
  end if;
  return public._drop_enrollment_core(p_enrollment_id, p_left_at, p_delete_attendance, 'dropped');
end;
$$;

-- Đổi lớp trong một giao dịch: vào lớp mới từ p_date, nghỉ lớp cũ cùng ngày (left_reason = 'transferred').
-- Giáo viên: hai lớp cùng khối, cùng môn, cùng do mình dạy, ngày trong tháng hiện tại.
create or replace function public.transfer_enrollment(
  p_enrollment_id     uuid,
  p_new_class_id      uuid,
  p_date              date,
  p_delete_attendance boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.assert_staff();
  v_old    public.class_enrollments%rowtype;
  v_oldc   public.classes%rowtype;
  v_new    public.classes%rowtype;
  v_later  integer;
  v_new_id uuid;
begin
  if p_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày chuyển lớp.';
  end if;

  select * into v_old from public.class_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;
  if v_old.status <> 'active' then
    raise exception 'Trung tâm: Học sinh này đã nghỉ khỏi lớp trước đó nên không thể đổi lớp.';
  end if;

  select * into v_new from public.classes where id = p_new_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp muốn chuyển tới.';
  end if;
  select * into v_oldc from public.classes where id = v_old.class_id;

  if v_role = 'teacher' then
    if v_oldc.teacher_id is distinct from public.current_teacher_id()
       or v_new.teacher_id is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Giáo viên chỉ được chuyển học sinh giữa các lớp do chính mình phụ trách.';
    end if;
    if v_oldc.grade is distinct from v_new.grade or v_oldc.subject is distinct from v_new.subject then
      raise exception 'Trung tâm: Giáo viên chỉ được chuyển học sinh sang lớp cùng khối và cùng môn.';
    end if;
    if p_date < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được chuyển lớp cho học sinh trong tháng hiện tại.';
    end if;
  end if;

  if v_new.id = v_old.class_id then
    raise exception 'Trung tâm: Lớp mới phải khác lớp hiện tại của học sinh.';
  end if;
  if v_new.deleted_at is not null then
    raise exception 'Trung tâm: Lớp % đã bị ẩn. Hãy khôi phục lớp trước.', v_new.name;
  end if;
  if p_date < v_old.joined_at then
    raise exception 'Trung tâm: Ngày chuyển lớp không được sớm hơn ngày vào lớp cũ (%).', public._fmt_date(v_old.joined_at);
  end if;
  if p_date > public.vn_today() then
    raise exception 'Trung tâm: Ngày chuyển lớp không được ở tương lai.';
  end if;

  select count(*) into v_later
  from public.attendance_records
  where enrollment_id = p_enrollment_id and attendance_date > p_date;
  if v_later > 0 and not coalesce(p_delete_attendance, false) then
    raise exception 'Trung tâm: Học sinh có % buổi điểm danh ở lớp cũ sau ngày chuyển lớp. Hãy xác nhận xóa các buổi đó hoặc chọn ngày chuyển muộn hơn.', v_later;
  end if;

  insert into public.class_enrollments (class_id, student_id, joined_at)
  values (v_new.id, v_old.student_id, p_date)
  returning id into v_new_id;

  return public._drop_enrollment_core(p_enrollment_id, p_date, p_delete_attendance, 'transferred', v_new_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Điểm danh & học bù
-- ---------------------------------------------------------------------

-- Bản ghi điểm danh của một lớp trong một ngày (trả về cho giao diện sau mỗi lần lưu).
create or replace function public._attendance_rows(p_class_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'enrollment_id', a.enrollment_id, 'student_id', a.student_id,
           'status', a.status, 'price_snapshot', a.price_snapshot, 'makeup_of_date', a.makeup_of_date
         ) order by a.created_at, a.id), '[]'::jsonb)
  from public.attendance_records a
  where a.class_id = p_class_id and a.attendance_date = p_date;
$$;

-- Lưu/sửa/xóa điểm danh cả buổi. p_items: [{enrollment_id, status}] (status NULL = xóa bản ghi).
-- Đơn giá: Có mặt <-> Vắng giữ giá đã đóng băng; chấm mới hoặc từ Có phép sang tính tiền lấy giá hiện tại.
-- Buổi học bù và buổi gốc đã được bù không sửa ở đây (dùng "Hủy học bù").
-- Trả về toàn bộ bản ghi của lớp trong ngày đó sau khi lưu.
create or replace function public.save_attendance(
  p_class_id uuid,
  p_date     date,
  p_items    jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.assert_staff();
  v_class  public.classes%rowtype;
  v_item   jsonb;
  v_enr    public.class_enrollments%rowtype;
  v_enr_id uuid;
  v_status text;
  v_rec    public.attendance_records%rowtype;
  v_exists boolean;
  v_price  integer;
  v_bu     date;
begin
  if p_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày điểm danh.';
  end if;
  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;
  if v_role = 'teacher' then
    if v_class.teacher_id is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn chỉ được điểm danh cho lớp mình phụ trách.';
    end if;
    if public.vn_month_start(p_date) <> public.vn_month_start() then
      raise exception 'Trung tâm: Tháng trước đã chốt, Giáo viên chỉ được điểm danh trong tháng hiện tại.';
    end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Trung tâm: Chưa có học sinh nào để lưu điểm danh.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_enr_id := nullif(v_item->>'enrollment_id', '')::uuid;
    v_status := nullif(v_item->>'status', '');
    if v_status is not null and v_status not in ('present', 'absent', 'absent_excused') then
      raise exception 'Trung tâm: Trạng thái điểm danh không hợp lệ.';
    end if;

    select * into v_enr from public.class_enrollments where id = v_enr_id;
    if not found then
      raise exception 'Trung tâm: Không tìm thấy ghi danh của học sinh trong lớp.';
    end if;

    select * into v_rec
    from public.attendance_records
    where class_id = p_class_id and student_id = v_enr.student_id and attendance_date = p_date
    for update;
    v_exists := found;

    if v_exists and v_rec.makeup_of_date is not null then
      raise exception 'Trung tâm: Đây là buổi học bù. Hãy dùng "Hủy học bù" nếu muốn bỏ buổi này.';
    end if;
    if v_exists then
      select m.attendance_date into v_bu
      from public.attendance_records m
      where m.enrollment_id = v_rec.enrollment_id and m.makeup_of_date = p_date and m.class_id <> p_class_id;
      if v_bu is not null then
        raise exception 'Trung tâm: Buổi ngày % của học sinh này đã được học bù ngày %. Hãy hủy học bù trước khi sửa buổi này.',
          public._fmt_date(p_date), public._fmt_date(v_bu);
      end if;
    end if;

    if v_status is null then
      if v_exists then
        delete from public.attendance_records where id = v_rec.id;
      end if;
      continue;
    end if;

    if v_role = 'teacher' and v_enr.class_id <> p_class_id and not v_exists then
      raise exception 'Trung tâm: Bạn chỉ được điểm danh cho lớp mình phụ trách.';
    end if;

    if not v_exists then
      if v_enr.class_id <> p_class_id then
        raise exception 'Trung tâm: Học sinh học bù phải được thêm bằng nút "Học bù".';
      end if;
      if v_class.deleted_at is not null then
        raise exception 'Trung tâm: Lớp này đã bị ẩn nên không thể điểm danh mới.';
      end if;
    end if;

    if v_status = 'absent_excused' then
      v_price := null;
    elsif v_exists and v_rec.price_snapshot is not null then
      v_price := v_rec.price_snapshot;
    else
      v_price := v_class.price_per_session;
    end if;

    if v_exists then
      if (v_rec.status, v_rec.price_snapshot) is distinct from (v_status, v_price) then
        update public.attendance_records set status = v_status, price_snapshot = v_price where id = v_rec.id;
      end if;
    else
      insert into public.attendance_records (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
      values (v_enr_id, p_class_id, v_enr.student_id, p_date, v_status, v_price);
    end if;
  end loop;

  return public._attendance_rows(p_class_id, p_date);
end;
$$;

-- Ghi học bù giữa 2 lớp cùng giáo viên (không bắt buộc cùng khối). Mỗi buổi gốc chỉ bù 1 lần.
--   Buổi gốc chuyển thành Có phép (0đ); buổi bù là Có mặt ở lớp bù với đơn giá của buổi gốc
--   (giá đã đóng băng nếu buổi gốc đang tính tiền, không thì giá hiện tại của lớp gốc).
-- Trả về {makeup_id, price}.
create or replace function public.record_makeup(
  p_makeup_class_id uuid,
  p_date            date,
  p_enrollment_id   uuid,
  p_original_date   date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.assert_staff();
  v_me       uuid := public.current_teacher_id();
  v_enr      public.class_enrollments%rowtype;
  v_orig     public.classes%rowtype;
  v_make     public.classes%rowtype;
  v_orig_rec public.attendance_records%rowtype;
  v_found    boolean;
  v_done     date;
  v_price    integer;
  v_id       uuid;
begin
  if p_date is null or p_original_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày học bù và buổi gốc được bù.';
  end if;

  select * into v_enr from public.class_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy ghi danh của học sinh trong lớp gốc.';
  end if;
  select * into v_orig from public.classes where id = v_enr.class_id;
  select * into v_make from public.classes where id = p_makeup_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học bù.';
  end if;

  if v_role = 'teacher' then
    if v_orig.teacher_id is distinct from v_me or v_make.teacher_id is distinct from v_me then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi học bù giữa các lớp do chính mình phụ trách.';
    end if;
    if p_date < public.vn_month_start() or p_original_date < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi nhận học bù cho các buổi học trong tháng hiện tại.';
    end if;
  end if;

  if v_make.id = v_orig.id then
    raise exception 'Trung tâm: Lớp học bù phải khác lớp gốc của học sinh.';
  end if;
  if v_make.deleted_at is not null then
    raise exception 'Trung tâm: Lớp học bù % đã bị ẩn.', v_make.name;
  end if;
  if v_orig.teacher_id is distinct from v_make.teacher_id then
    raise exception 'Trung tâm: Học bù chỉ áp dụng giữa các lớp do cùng một giáo viên phụ trách.';
  end if;
  if p_date > public.vn_today() then
    raise exception 'Trung tâm không ghi nhận học bù cho ngày trong tương lai.';
  end if;
  if p_date < v_enr.joined_at or (v_enr.left_at is not null and p_date > v_enr.left_at) then
    raise exception 'Trung tâm: Ngày học bù nằm ngoài thời gian học sinh học lớp gốc.';
  end if;
  if p_original_date < v_enr.joined_at or (v_enr.left_at is not null and p_original_date > v_enr.left_at) then
    raise exception 'Trung tâm: Buổi gốc được bù nằm ngoài thời gian học sinh học lớp gốc.';
  end if;
  if not public.class_has_session(v_make.id, p_date) then
    raise exception 'Trung tâm: Ngày % không nằm trong lịch học của lớp học bù %.', public._fmt_date(p_date), v_make.name;
  end if;
  if not public.class_has_session(v_orig.id, p_original_date) then
    raise exception 'Trung tâm: Ngày % không nằm trong lịch học của lớp gốc %.', public._fmt_date(p_original_date), v_orig.name;
  end if;
  if exists (
    select 1 from public.attendance_records
    where class_id = v_make.id and student_id = v_enr.student_id and attendance_date = p_date
  ) then
    raise exception 'Trung tâm: Học sinh này đã có điểm danh ở lớp % trong ngày %.', v_make.name, public._fmt_date(p_date);
  end if;

  select attendance_date into v_done
  from public.attendance_records
  where enrollment_id = v_enr.id and makeup_of_date = p_original_date;
  if v_done is not null then
    raise exception 'Trung tâm: Buổi ngày % của lớp % đã được học bù ngày %. Mỗi buổi chỉ được bù một lần.',
      public._fmt_date(p_original_date), v_orig.name, public._fmt_date(v_done);
  end if;

  select * into v_orig_rec
  from public.attendance_records
  where class_id = v_orig.id and student_id = v_enr.student_id and attendance_date = p_original_date
  for update;
  v_found := found;

  if v_found and v_orig_rec.status = 'present' then
    raise exception 'Trung tâm: Học sinh đã được điểm danh Có mặt ở buổi ngày % của lớp %, nên không thể học bù cho buổi này.',
      public._fmt_date(p_original_date), v_orig.name;
  end if;

  v_price := case when v_found and v_orig_rec.price_snapshot is not null
                  then v_orig_rec.price_snapshot else v_orig.price_per_session end;

  if v_found then
    if v_orig_rec.status <> 'absent_excused' then
      update public.attendance_records set status = 'absent_excused', price_snapshot = null where id = v_orig_rec.id;
    end if;
  else
    insert into public.attendance_records (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
    values (v_enr.id, v_orig.id, v_enr.student_id, p_original_date, 'absent_excused', null);
  end if;

  insert into public.attendance_records (
    enrollment_id, class_id, student_id, attendance_date, status, price_snapshot,
    makeup_of_date, makeup_prev_status, makeup_prev_price
  ) values (
    v_enr.id, v_make.id, v_enr.student_id, p_date, 'present', v_price,
    p_original_date,
    case when v_found then v_orig_rec.status end,
    case when v_found then v_orig_rec.price_snapshot end
  )
  returning id into v_id;

  return jsonb_build_object('makeup_id', v_id, 'price', v_price);
end;
$$;

-- Hủy học bù: xóa buổi bù và trả buổi gốc về như trước khi bù. Giáo viên: lớp mình, tháng hiện tại.
create or replace function public.cancel_makeup(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.assert_staff();
  v_rec  public.attendance_records%rowtype;
  v_enr  public.class_enrollments%rowtype;
begin
  select * into v_rec from public.attendance_records where id = p_record_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy buổi học bù.';
  end if;
  if v_rec.makeup_of_date is null then
    raise exception 'Trung tâm: Buổi này không phải buổi học bù có liên kết với buổi gốc.';
  end if;
  select * into v_enr from public.class_enrollments where id = v_rec.enrollment_id;

  if v_role = 'teacher' then
    if not exists (select 1 from public.classes c where c.id = v_rec.class_id and c.teacher_id = public.current_teacher_id())
       or not exists (select 1 from public.classes c where c.id = v_enr.class_id and c.teacher_id = public.current_teacher_id()) then
      raise exception 'Trung tâm: Giáo viên chỉ được hủy học bù giữa các lớp do chính mình phụ trách.';
    end if;
    if v_rec.attendance_date < public.vn_month_start() or v_rec.makeup_of_date < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được hủy học bù của các buổi trong tháng hiện tại.';
    end if;
  end if;

  perform public._undo_makeup(p_record_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Thống kê
-- ---------------------------------------------------------------------

-- Các khoảng hiện diện liên tục của học sinh tại Trung tâm (gộp các đợt học nối tiếp hoặc cách 1 ngày).
-- Kèm cờ graduated: khoảng kết thúc vì lớp cuối cấp đóng khi chuyển năm học.
create or replace function public._student_presence_spans()
returns table (student_id uuid, entry_date date, exit_date date, graduated boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select e.student_id as sid, e.joined_at as started_at,
           coalesce(e.left_at, 'infinity'::date) as ended_at,
           e.left_reason = 'graduated' as grad
    from public.class_enrollments e
  ),
  ordered as (
    select ev.*, max(ev.ended_at) over (
             partition by ev.sid order by ev.started_at, ev.ended_at
             rows between unbounded preceding and 1 preceding) as prev_end
    from ev
  ),
  flagged as (
    select o.*, case when o.prev_end is null or o.started_at > o.prev_end + 1 then 1 else 0 end as is_start
    from ordered o
  ),
  numbered as (
    select f.*, sum(f.is_start) over (
             partition by f.sid order by f.started_at, f.ended_at
             rows between unbounded preceding and current row) as island_no
    from flagged f
  ),
  islands as (
    select n.sid, n.island_no, min(n.started_at) as entry_date, max(n.ended_at) as exit_date
    from numbered n
    group by n.sid, n.island_no
  )
  select i.sid, i.entry_date, i.exit_date,
         exists (select 1 from numbered n
                 where n.sid = i.sid and n.island_no = i.island_no and n.ended_at = i.exit_date and n.grad)
  from islands i;
$$;

-- Quản lý: 6 chỉ số + doanh thu tháng (cộng price_snapshot). "Nghỉ hẳn" không tính học sinh tốt nghiệp.
-- Giáo viên: lớp đang phụ trách, học sinh đang dạy (hiện tại), doanh thu theo tháng của lớp mình.
create or replace function public.dashboard_summary(p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role      text := public.assert_staff();
  v_me        uuid := public.current_teacher_id();
  v_today     date := public.vn_today();
  v_start     date;
  v_next      date;
  v_ref       date;
  v_classes   integer;
  v_teachers  integer;
  v_active    integer;
  v_new       integer;
  v_dropped   integer;
  v_graduated integer;
  v_revenue   bigint;
  v_charged   integer;
begin
  if p_year is null or p_month is null or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Trung tâm: Tháng hoặc năm không hợp lệ.';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_next  := (v_start + interval '1 month')::date;
  if v_start > v_today then
    raise exception 'Trung tâm chưa có dữ liệu cho tháng trong tương lai.';
  end if;
  v_ref := least(v_today, v_next - 1);

  if v_role = 'teacher' then
    select count(*) into v_classes from public.classes c where c.teacher_id = v_me and c.deleted_at is null;
    select count(distinct e.student_id) into v_active
    from public.class_enrollments e join public.classes c on c.id = e.class_id
    where c.teacher_id = v_me and c.deleted_at is null and e.status = 'active';
    select coalesce(sum(a.price_snapshot) filter (where a.status <> 'absent_excused'), 0),
           count(*) filter (where a.status <> 'absent_excused')
      into v_revenue, v_charged
    from public.attendance_records a join public.classes c on c.id = a.class_id
    where c.teacher_id = v_me and a.attendance_date >= v_start and a.attendance_date < v_next;

    return jsonb_build_object(
      'month_start', v_start, 'as_of', v_ref, 'class_count', v_classes, 'teacher_count', 1,
      'student_count', v_active, 'new_students', 0, 'dropped_students', 0, 'graduated_students', 0,
      'revenue', v_revenue, 'charged_sessions', v_charged,
      'month_closed', public.month_is_closed(v_start)
    );
  end if;

  select count(*) into v_classes
  from public.classes c
  where (c.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_ref
    and (c.deleted_at is null or (c.deleted_at at time zone 'Asia/Ho_Chi_Minh')::date > v_ref);

  select count(*) into v_teachers
  from public.teachers t
  where (t.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_ref
    and (t.deleted_at is null or (t.deleted_at at time zone 'Asia/Ho_Chi_Minh')::date > v_ref);

  with spans as materialized (select * from public._student_presence_spans()),
  active_set as (select distinct student_id from spans where entry_date <= v_ref and exit_date > v_ref),
  exits as (
    select s.student_id, bool_or(s.graduated) as graduated
    from spans s
    where s.exit_date between v_start and v_ref
      and not exists (select 1 from active_set a where a.student_id = s.student_id)
    group by s.student_id
  )
  select (select count(*) from active_set),
         (select count(distinct student_id) from spans where entry_date between v_start and v_ref),
         (select count(*) from exits where not graduated),
         (select count(*) from exits where graduated)
    into v_active, v_new, v_dropped, v_graduated;

  select coalesce(sum(a.price_snapshot) filter (where a.status <> 'absent_excused'), 0),
         count(*) filter (where a.status <> 'absent_excused')
    into v_revenue, v_charged
  from public.attendance_records a
  where a.attendance_date >= v_start and a.attendance_date < v_next;

  return jsonb_build_object(
    'month_start', v_start, 'as_of', v_ref, 'class_count', v_classes, 'teacher_count', v_teachers,
    'student_count', v_active, 'new_students', v_new, 'dropped_students', v_dropped,
    'graduated_students', v_graduated, 'revenue', v_revenue, 'charged_sessions', v_charged,
    'month_closed', public.month_is_closed(v_start)
  );
end;
$$;

-- Lịch học trong ngày (theo lịch hiệu lực của ngày đó) kèm sĩ số và số đã điểm danh. Chỉ Quản lý.
create or replace function public.dashboard_schedule(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.assert_manager();
  if p_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày xem lịch học.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', x.class_id, 'name', x.name, 'subject', x.subject, 'grade', x.grade,
           'teacher_name', x.teacher_name, 'start_time', x.start_time, 'end_time', x.end_time,
           'total_count', x.total_count, 'marked_count', x.marked_count
         ) order by x.start_time, x.name), '[]'::jsonb)
    into v_result
  from (
    select c.id as class_id, c.name, c.subject, c.grade, t.full_name as teacher_name,
           to_char(s.start_time, 'HH24:MI:SS') as start_time, to_char(s.end_time, 'HH24:MI:SS') as end_time,
           (select count(*) from (
              select e.student_id from public.class_enrollments e
              where e.class_id = c.id and e.joined_at <= p_date and (e.left_at is null or e.left_at >= p_date)
              union
              select a.student_id from public.attendance_records a
              where a.class_id = c.id and a.attendance_date = p_date
            ) u) as total_count,
           (select count(*) from public.attendance_records a
            where a.class_id = c.id and a.attendance_date = p_date) as marked_count
    from public.classes c
    join public.class_schedules s
      on s.class_id = c.id
     and s.day_of_week = public.vn_day_of_week(p_date)
     and (s.valid_from is null or s.valid_from <= p_date)
     and (s.valid_to is null or s.valid_to >= p_date)
    left join public.teachers t on t.id = c.teacher_id
    where c.deleted_at is null
  ) x;

  return v_result;
end;
$$;
