-- =====================================================================
-- Trung tâm ScienceHub - FILE 03: HÀM VAI TRÒ (AUTH) & 10 HÀM NGHIỆP VỤ (RPC)
-- Chạy SAU 02_triggers.sql.
-- Điểm cải tiến so với bản cũ:
--   * Không phải copy-paste lại 10 hàm ở bước Lockdown.
--   * Tách hàm nội bộ _drop_enrollment_core để ở V2-2 khi mở quyền đổi lớp
--     (transfer_enrollment) cho Giáo viên sẽ không bị chặn bởi quyền Quản lý
--     của hàm drop_enrollment.
--   * drop_enrollment & transfer_enrollment là SECURITY DEFINER (search_path cố định)
--     vì _drop_enrollment_core đã bị thu quyền EXECUTE; assert_manager() vẫn chốt
--     quyền ở dòng đầu. Từ V2-2, mọi RPC mở cho Giáo viên cũng phải theo quy ước này.
--   * Tối ưu dashboard_summary: chỉ quét student_presence_spans() 1 lần thay vì 4 lần.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. CHỐT CHẶN: KHÔNG CHO CHẠY LẠI FILE NÀY SAU KHI ĐÃ CHẠY FILE 05
-- File 05 (V2-2) đã nâng cấp save_class, save_attendance, dashboard_summary,
-- drop_enrollment, record_makeup, register_student_in_class, transfer_enrollment,
-- update_student. Chạy lại file 03 sẽ ghi đè về bản cũ và làm hỏng quyền Giáo viên.
-- assert_staff() chỉ do file 05 tạo ra, nên có nó nghĩa là 05 đã được chạy.
-- ---------------------------------------------------------------------
do $guard$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assert_staff'
  ) then
    raise exception 'DUNG LAI: Database da chay file 05 tro di. KHONG chay lai 03_rpc_and_auth.sql (se ghi de cac ham da nang cap). Neu can cap nhat, hay chay file migration moi nhat (vi du 09).';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. CÁC HÀM KIỂM TRA VAI TRÒ & PHIÊN ĐĂNG NHẬP (SECURITY DEFINER)
-- ---------------------------------------------------------------------
create or replace function public.app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_teacher uuid;
  v_active  boolean;
  v_deleted timestamptz;
  v_last    timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  select p.role, p.teacher_id, p.active
  into v_role, v_teacher, v_active
  from public.profiles p
  where p.user_id = v_uid;

  if not found or not coalesce(v_active, false) then
    return null;
  end if;

  if v_role = 'teacher' then
    select t.deleted_at into v_deleted
    from public.teachers t
    where t.id = v_teacher;
    if not found or v_deleted is not null then
      return null;
    end if;

    select u.last_sign_in_at into v_last
    from auth.users u
    where u.id = v_uid;
    if v_last is null or (now() - v_last) > interval '48 hours' then
      return null;
    end if;
  end if;

  return v_role;
end;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'manager', false);
$$;

create or replace function public.current_teacher_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
begin
  if public.app_role() = 'teacher' then
    select p.teacher_id into v_teacher
    from public.profiles p
    where p.user_id = auth.uid();
    return v_teacher;
  end if;
  return null;
end;
$$;

create or replace function public.my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_last     timestamptz;
  v_role     text;
  v_teacher  uuid;
  v_active   boolean;
  v_tname    text;
  v_tdeleted timestamptz;
  v_expires  timestamptz;
  v_status   text;
begin
  if v_uid is null then
    return null;
  end if;

  select u.email, u.last_sign_in_at
  into v_email, v_last
  from auth.users u
  where u.id = v_uid;

  select p.role, p.teacher_id, p.active
  into v_role, v_teacher, v_active
  from public.profiles p
  where p.user_id = v_uid;

  if not found then
    return jsonb_build_object(
      'user_id',         v_uid,
      'email',           v_email,
      'role',            v_role,
      'teacher_id',      v_teacher,
      'teacher_name',    v_tname,
      'active',          false,
      'last_sign_in_at', v_last,
      'expires_at',      v_expires,
      'status',          'no_profile'
    );
  end if;

  if v_role = 'teacher' then
    select t.full_name, t.deleted_at
    into v_tname, v_tdeleted
    from public.teachers t
    where t.id = v_teacher;
    if v_last is not null then
      v_expires := v_last + interval '48 hours';
    end if;
  end if;

  v_status := case
    when not v_active then 'inactive'
    when v_role = 'teacher' and v_tdeleted is not null then 'teacher_hidden'
    when v_role = 'teacher' and (v_expires is null or now() > v_expires) then 'expired'
    else 'ok'
  end;

  return jsonb_build_object(
    'user_id',         v_uid,
    'email',           v_email,
    'role',            v_role,
    'teacher_id',      v_teacher,
    'teacher_name',    v_tname,
    'active',          v_active,
    'last_sign_in_at', v_last,
    'expires_at',      v_expires,
    'status',          v_status
  );
end;
$$;

-- Tạo Quản lý đầu tiên (chỉ gọi được trong SQL Editor)
create or replace function public.setup_initial_manager(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'Trung tâm: Vui lòng nhập email của Quản lý.';
  end if;

  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_uid is null then
    raise exception 'Trung tâm: Không tìm thấy tài khoản có email % trong Supabase Authentication. Hãy tạo user trong Dashboard trước.', trim(p_email);
  end if;

  if exists (select 1 from public.profiles where role = 'manager' and active)
     and not public.is_manager()
     and not exists (
       select 1 from public.profiles
       where user_id = v_uid and role = 'manager' and active
     ) then
    raise exception 'Trung tâm: Đã có Quản lý đang hoạt động. Chỉ Quản lý mới được thêm Quản lý khác.';
  end if;

  insert into public.profiles (user_id, role, teacher_id, active)
  values (v_uid, 'manager', null, true)
  on conflict (user_id) do update
    set role = 'manager', teacher_id = null, active = true;
end;
$$;

revoke execute on function public.setup_initial_manager(text) from anon, authenticated, public;

-- Chốt chặn quyền Quản lý dùng chung cho các hàm RPC
create or replace function public.assert_manager()
returns void
language plpgsql stable as $$
begin
  if not public.is_manager() then
    raise exception 'Trung tâm: Chỉ Quản lý mới có quyền thực hiện thao tác này.';
  end if;
end;
$$;

-- Policy cho bảng profiles (mỗi người đọc dòng của mình, Quản lý toàn quyền)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_manager_all on public.profiles;
create policy profiles_manager_all on public.profiles
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- ---------------------------------------------------------------------
-- 2. MƯỜI HÀM NGHIỆP VỤ (RPC)
-- ---------------------------------------------------------------------

-- 2.1 update_student: sửa học sinh kèm phụ huynh
create or replace function public.update_student(
  p_student_id   uuid,
  p_full_name    text,
  p_phone        text,
  p_parent_name  text,
  p_parent_phone text
) returns void
language plpgsql as $$
declare
  v_current_parent uuid;
  v_found_parent   uuid;
  v_new_parent     uuid;
  v_child_count    integer;
begin
  perform public.assert_manager();

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Vui lòng nhập họ tên học sinh.';
  end if;
  if coalesce(trim(p_parent_phone), '') = '' then
    raise exception 'Vui lòng nhập số điện thoại phụ huynh.';
  end if;

  select parent_id into v_current_parent from public.students where id = p_student_id;
  if not found then
    raise exception 'Không tìm thấy học sinh.';
  end if;

  select id into v_found_parent from public.parents where phone = trim(p_parent_phone);

  if v_found_parent is not null then
    v_new_parent := v_found_parent;
    if v_found_parent = v_current_parent and coalesce(trim(p_parent_name), '') <> '' then
      update public.parents set full_name = trim(p_parent_name) where id = v_found_parent;
    end if;
  else
    if coalesce(trim(p_parent_name), '') = '' then
      raise exception 'Vui lòng nhập họ tên phụ huynh.';
    end if;

    select count(*) into v_child_count
    from public.students where parent_id = v_current_parent;

    if v_current_parent is not null and v_child_count = 1 then
      update public.parents
      set full_name = trim(p_parent_name), phone = trim(p_parent_phone)
      where id = v_current_parent;
      v_new_parent := v_current_parent;
    else
      insert into public.parents (full_name, phone)
      values (trim(p_parent_name), trim(p_parent_phone))
      returning id into v_new_parent;
    end if;
  end if;

  update public.students
  set full_name = trim(p_full_name),
      phone     = nullif(trim(coalesce(p_phone, '')), ''),
      parent_id = v_new_parent
  where id = p_student_id;
end;
$$;

-- 2.2 save_class: thêm/sửa lớp và toàn bộ lịch học trong 1 giao dịch
create or replace function public.save_class(
  p_class_id   uuid,
  p_name       text,
  p_subject    text,
  p_grade      integer,
  p_class_no   integer,
  p_teacher_id uuid,
  p_price      integer,
  p_schedule   jsonb,
  p_restore    boolean default false
) returns uuid
language plpgsql as $$
declare
  v_id    uuid;
  v_item  jsonb;
  v_day   integer;
  v_start time;
  v_end   time;
  v_days  integer[] := '{}';
begin
  perform public.assert_manager();

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Tên lớp không được để trống.';
  end if;
  if p_teacher_id is null then
    raise exception 'Vui lòng chọn giáo viên phụ trách.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Đơn giá phải là số nguyên từ 0 trở lên.';
  end if;
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'array'
     or jsonb_array_length(p_schedule) = 0 then
    raise exception 'Vui lòng chọn ít nhất một ngày học trong tuần.';
  end if;

  for v_item in select * from jsonb_array_elements(p_schedule) loop
    v_day   := (v_item->>'day')::integer;
    v_start := (v_item->>'start')::time;
    v_end   := (v_item->>'end')::time;

    if v_day is null or v_day < 2 or v_day > 8 then
      raise exception 'Ngày học trong tuần không hợp lệ.';
    end if;
    if v_start is null or v_end is null then
      raise exception 'Vui lòng nhập giờ bắt đầu và giờ kết thúc cho từng ngày học.';
    end if;
    if v_end <= v_start then
      raise exception 'Giờ kết thúc phải sau giờ bắt đầu.';
    end if;
    if v_day = any (v_days) then
      raise exception 'Mỗi ngày trong tuần chỉ được có một khung giờ.';
    end if;
    v_days := v_days || v_day;
  end loop;

  if p_class_id is null then
    insert into public.classes (name, subject, grade, class_no, teacher_id, price_per_session)
    values (trim(p_name), p_subject, p_grade, p_class_no, p_teacher_id, p_price)
    returning id into v_id;
  else
    update public.classes
    set name              = trim(p_name),
        subject           = p_subject,
        grade             = p_grade,
        class_no          = p_class_no,
        teacher_id        = p_teacher_id,
        price_per_session = p_price,
        deleted_at        = case when coalesce(p_restore, false) then null else deleted_at end
    where id = p_class_id;
    if not found then
      raise exception 'Không tìm thấy lớp.';
    end if;
    v_id := p_class_id;
    delete from public.class_schedules where class_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_schedule) loop
    insert into public.class_schedules (class_id, day_of_week, start_time, end_time)
    values (
      v_id,
      (v_item->>'day')::integer,
      (v_item->>'start')::time,
      (v_item->>'end')::time
    );
  end loop;

  return v_id;
end;
$$;

-- 2.3 register_student_in_class: tạo học sinh + phụ huynh + ghi danh
create or replace function public.register_student_in_class(
  p_class_id     uuid,
  p_joined_at    date,
  p_full_name    text,
  p_phone        text,
  p_parent_name  text,
  p_parent_phone text
) returns uuid
language plpgsql as $$
declare
  v_parent_id  uuid;
  v_student_id uuid;
begin
  perform public.assert_manager();

  if p_class_id is null then
    raise exception 'Vui lòng chọn lớp cho học sinh.';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Vui lòng nhập họ tên học sinh.';
  end if;
  if coalesce(trim(p_parent_phone), '') = '' then
    raise exception 'Vui lòng nhập số điện thoại phụ huynh.';
  end if;

  select id into v_parent_id from public.parents where phone = trim(p_parent_phone);

  if v_parent_id is null then
    if coalesce(trim(p_parent_name), '') = '' then
      raise exception 'Vui lòng nhập họ tên phụ huynh.';
    end if;
    insert into public.parents (full_name, phone)
    values (trim(p_parent_name), trim(p_parent_phone))
    returning id into v_parent_id;
  end if;

  insert into public.students (full_name, phone, parent_id)
  values (trim(p_full_name), nullif(trim(coalesce(p_phone, '')), ''), v_parent_id)
  returning id into v_student_id;

  insert into public.class_enrollments (class_id, student_id, joined_at)
  values (p_class_id, v_student_id, coalesce(p_joined_at, public.vn_today()));

  return v_student_id;
end;
$$;

-- 2.4 _drop_enrollment_core (Hàm nội bộ, không lộ ra API) & drop_enrollment
create or replace function public._drop_enrollment_core(
  p_enrollment_id     uuid,
  p_left_at           date,
  p_delete_attendance boolean default false
) returns integer
language plpgsql as $$
declare
  v_enrollment public.class_enrollments%rowtype;
  v_later      integer;
  v_today      date := public.vn_today();
begin
  select * into v_enrollment
  from public.class_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'Học sinh này đã nghỉ khỏi lớp trước đó.';
  end if;
  if p_left_at is null then
    raise exception 'Vui lòng chọn ngày nghỉ.';
  end if;
  if p_left_at < v_enrollment.joined_at then
    raise exception 'Ngày nghỉ không được sớm hơn ngày vào lớp.';
  end if;
  if p_left_at > v_today then
    raise exception 'Ngày nghỉ không được ở tương lai.';
  end if;

  select count(*) into v_later
  from public.attendance_records
  where enrollment_id = p_enrollment_id and attendance_date > p_left_at;

  if v_later > 0 then
    if not coalesce(p_delete_attendance, false) then
      raise exception 'Học sinh có % buổi điểm danh sau ngày nghỉ. Hãy xác nhận xóa các buổi đó hoặc chọn ngày nghỉ muộn hơn.', v_later;
    end if;

    delete from public.attendance_records
    where enrollment_id = p_enrollment_id and attendance_date > p_left_at;
  end if;

  update public.class_enrollments
  set status = 'dropped', left_at = p_left_at
  where id = p_enrollment_id;

  return v_later;
end;
$$;

revoke execute on function public._drop_enrollment_core(uuid, date, boolean) from anon, authenticated, public;

-- SECURITY DEFINER: hàm lõi _drop_enrollment_core đã bị thu quyền EXECUTE của
-- authenticated nên hàm công khai phải chạy bằng quyền chủ sở hữu. Quyền thật
-- vẫn được chốt bởi assert_manager() ngay dòng đầu (auth.uid() vẫn là người gọi).
create or replace function public.drop_enrollment(
  p_enrollment_id     uuid,
  p_left_at           date,
  p_delete_attendance boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();
  return public._drop_enrollment_core(p_enrollment_id, p_left_at, p_delete_attendance);
end;
$$;

-- 2.5 transfer_enrollment: Đổi lớp trong 1 giao dịch (vào lớp mới trước, nghỉ lớp cũ sau)
-- SECURITY DEFINER vì gọi _drop_enrollment_core (đã thu quyền EXECUTE của authenticated);
-- quyền thật được chốt bởi assert_manager() ngay đầu hàm.
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
  v_old   public.class_enrollments%rowtype;
  v_new   public.classes%rowtype;
  v_today date := public.vn_today();
  v_later integer;
begin
  perform public.assert_manager();

  if p_date is null then
    raise exception 'Vui lòng chọn ngày chuyển lớp.';
  end if;

  select * into v_old
  from public.class_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ghi danh của học sinh trong lớp.';
  end if;
  if v_old.status <> 'active' then
    raise exception 'Học sinh này đã nghỉ khỏi lớp trước đó nên không thể đổi lớp.';
  end if;

  select * into v_new from public.classes where id = p_new_class_id;
  if not found then
    raise exception 'Không tìm thấy lớp muốn chuyển tới.';
  end if;
  if v_new.id = v_old.class_id then
    raise exception 'Lớp mới phải khác lớp hiện tại của học sinh.';
  end if;
  if v_new.deleted_at is not null then
    raise exception 'Lớp muốn chuyển tới đã bị ẩn. Hãy khôi phục lớp trước.';
  end if;

  if exists (
    select 1 from public.class_enrollments
    where student_id = v_old.student_id and class_id = v_new.id and status = 'active'
  ) then
    raise exception 'Học sinh này đang học lớp % rồi.', v_new.name;
  end if;

  if p_date < v_old.joined_at then
    raise exception 'Ngày chuyển lớp không được sớm hơn ngày vào lớp cũ (%).',
      to_char(v_old.joined_at, 'DD/MM/YYYY');
  end if;
  if p_date > v_today then
    raise exception 'Ngày chuyển lớp không được ở tương lai.';
  end if;

  select count(*) into v_later
  from public.attendance_records
  where enrollment_id = p_enrollment_id and attendance_date > p_date;

  if v_later > 0 and not coalesce(p_delete_attendance, false) then
    raise exception 'Học sinh có % buổi điểm danh ở lớp cũ sau ngày chuyển lớp. Hãy xác nhận xóa các buổi đó hoặc chọn ngày chuyển muộn hơn.', v_later;
  end if;

  -- 1. Vào lớp mới trước (tránh kích hoạt ẩn học sinh/phụ huynh)
  insert into public.class_enrollments (class_id, student_id, status, joined_at)
  values (v_new.id, v_old.student_id, 'active', p_date);

  -- 2. Nghỉ lớp cũ bằng hàm nội bộ
  return public._drop_enrollment_core(p_enrollment_id, p_date, coalesce(p_delete_attendance, false));
end;
$$;

-- 2.6 save_attendance: lưu/sửa/xóa điểm danh cả buổi & đóng băng đơn giá
create or replace function public.save_attendance(
  p_class_id uuid,
  p_date     date,
  p_items    jsonb
) returns integer
language plpgsql as $$
declare
  v_class   public.classes%rowtype;
  v_item    jsonb;
  v_enr     public.class_enrollments%rowtype;
  v_enr_id  uuid;
  v_status  text;
  v_rec     public.attendance_records%rowtype;
  v_exists  boolean;
  v_price   integer;
  v_count   integer := 0;
begin
  perform public.assert_manager();

  if p_date is null then
    raise exception 'Vui lòng chọn ngày điểm danh.';
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'Không tìm thấy lớp học.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Chưa có học sinh nào để lưu điểm danh.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_enr_id := nullif(v_item->>'enrollment_id', '')::uuid;
    v_status := nullif(v_item->>'status', '');

    if v_status is not null and v_status not in ('present', 'absent', 'absent_excused') then
      raise exception 'Trạng thái điểm danh không hợp lệ.';
    end if;

    select * into v_enr from public.class_enrollments where id = v_enr_id;
    if not found then
      raise exception 'Không tìm thấy ghi danh của học sinh trong lớp.';
    end if;

    select * into v_rec
    from public.attendance_records
    where class_id = p_class_id
      and student_id = v_enr.student_id
      and attendance_date = p_date
    for update;
    v_exists := found;

    if v_status is null then
      if v_exists then
        delete from public.attendance_records where id = v_rec.id;
        v_count := v_count + 1;
      end if;
      continue;
    end if;

    if not v_exists then
      if v_enr.class_id <> p_class_id then
        raise exception 'Học sinh học bù phải được thêm bằng nút "Học bù".';
      end if;
      if v_class.deleted_at is not null then
        raise exception 'Lớp này đã bị ẩn nên không thể điểm danh mới.';
      end if;
      if not exists (
        select 1 from public.class_schedules
        where class_id = p_class_id
          and day_of_week = public.vn_day_of_week(p_date)
      ) then
        raise exception 'Ngày % không nằm trong lịch học của lớp %.',
          to_char(p_date, 'DD/MM/YYYY'), v_class.name;
      end if;
    end if;

    if v_status = 'absent_excused' then
      v_price := null;
    elsif v_exists and v_rec.price_snapshot is not null then
      v_price := v_rec.price_snapshot;
    else
      select price_per_session into v_price from public.classes where id = v_enr.class_id;
    end if;

    insert into public.attendance_records
      (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
    values
      (v_enr_id, p_class_id, v_enr.student_id, p_date, v_status, v_price)
    on conflict (class_id, student_id, attendance_date)
    do update set status = excluded.status, price_snapshot = excluded.price_snapshot;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 2.7 record_makeup: ghi nhận học bù
create or replace function public.record_makeup(
  p_makeup_class_id uuid,
  p_date            date,
  p_enrollment_id   uuid,
  p_original_date   date
) returns void
language plpgsql as $$
declare
  v_today    date := public.vn_today();
  v_enr      public.class_enrollments%rowtype;
  v_orig     public.classes%rowtype;
  v_make     public.classes%rowtype;
  v_orig_rec public.attendance_records%rowtype;
  v_found    boolean;
begin
  perform public.assert_manager();

  if p_date is null or p_original_date is null then
    raise exception 'Vui lòng chọn ngày học bù và buổi gốc được bù.';
  end if;

  select * into v_enr from public.class_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Không tìm thấy ghi danh của học sinh trong lớp gốc.';
  end if;

  select * into v_orig from public.classes where id = v_enr.class_id;
  select * into v_make from public.classes where id = p_makeup_class_id;
  if not found then
    raise exception 'Không tìm thấy lớp học bù.';
  end if;

  if v_make.id = v_orig.id then
    raise exception 'Lớp học bù phải khác lớp gốc của học sinh.';
  end if;
  if v_make.deleted_at is not null then
    raise exception 'Lớp học bù đã bị ẩn.';
  end if;
  if v_orig.teacher_id is null or v_orig.teacher_id is distinct from v_make.teacher_id then
    raise exception 'Học bù chỉ áp dụng giữa các lớp do cùng một giáo viên phụ trách.';
  end if;

  if p_date > v_today then
    raise exception 'Trung tâm không ghi nhận học bù cho ngày trong tương lai.';
  end if;

  if p_date < v_enr.joined_at or (v_enr.left_at is not null and p_date > v_enr.left_at) then
    raise exception 'Ngày học bù nằm ngoài thời gian học sinh học lớp gốc.';
  end if;
  if p_original_date < v_enr.joined_at
     or (v_enr.left_at is not null and p_original_date > v_enr.left_at) then
    raise exception 'Buổi gốc được bù nằm ngoài thời gian học sinh học lớp gốc.';
  end if;

  if not exists (
    select 1 from public.class_schedules
    where class_id = v_make.id and day_of_week = public.vn_day_of_week(p_date)
  ) then
    raise exception 'Ngày % không nằm trong lịch học của lớp học bù %.',
      to_char(p_date, 'DD/MM/YYYY'), v_make.name;
  end if;
  if not exists (
    select 1 from public.class_schedules
    where class_id = v_orig.id and day_of_week = public.vn_day_of_week(p_original_date)
  ) then
    raise exception 'Ngày % không nằm trong lịch học của lớp gốc %.',
      to_char(p_original_date, 'DD/MM/YYYY'), v_orig.name;
  end if;

  if exists (
    select 1 from public.attendance_records
    where class_id = v_make.id and student_id = v_enr.student_id and attendance_date = p_date
  ) then
    raise exception 'Học sinh này đã có điểm danh ở lớp % trong ngày %.',
      v_make.name, to_char(p_date, 'DD/MM/YYYY');
  end if;

  select * into v_orig_rec
  from public.attendance_records
  where class_id = v_orig.id and student_id = v_enr.student_id and attendance_date = p_original_date
  for update;
  v_found := found;

  if v_found and v_orig_rec.status = 'present' then
    raise exception 'Học sinh đã được điểm danh Có mặt ở buổi ngày % của lớp %, nên không thể học bù cho buổi này.',
      to_char(p_original_date, 'DD/MM/YYYY'), v_orig.name;
  end if;

  if v_found then
    update public.attendance_records
    set status = 'absent_excused', price_snapshot = null
    where id = v_orig_rec.id;
  else
    insert into public.attendance_records
      (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
    values
      (v_enr.id, v_orig.id, v_enr.student_id, p_original_date, 'absent_excused', null);
  end if;

  insert into public.attendance_records
    (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
  values
    (v_enr.id, v_make.id, v_enr.student_id, p_date, 'present', v_orig.price_per_session);
end;
$$;

-- 2.8 student_presence_spans: gộp các khoảng thời gian học liên tục tại Trung tâm
create or replace function public.student_presence_spans()
returns table (student_id uuid, entry_date date, exit_date date)
language sql stable as $$
  with ev as (
    select e.student_id as sid,
           e.joined_at as started_at,
           coalesce(e.left_at, 'infinity'::date) as ended_at
    from public.class_enrollments e
  ),
  ordered as (
    select ev.sid, ev.started_at, ev.ended_at,
           max(ev.ended_at) over (
             partition by ev.sid
             order by ev.started_at, ev.ended_at
             rows between unbounded preceding and 1 preceding
           ) as prev_end
    from ev
  ),
  flagged as (
    select o.sid, o.started_at, o.ended_at,
           case when o.prev_end is null or o.started_at > o.prev_end + 1 then 1 else 0 end as is_start
    from ordered o
  ),
  numbered as (
    select f.sid, f.started_at, f.ended_at,
           sum(f.is_start) over (
             partition by f.sid
             order by f.started_at, f.ended_at
             rows between unbounded preceding and current row
           ) as island_no
    from flagged f
  )
  select n.sid, min(n.started_at), max(n.ended_at)
  from numbered n
  where public.is_manager()
  group by n.sid, n.island_no;
$$;

-- 2.9 dashboard_summary: Thống kê 6 thẻ Dashboard (Đã tối ưu chỉ quét spans 1 lần)
create or replace function public.dashboard_summary(p_year integer, p_month integer)
returns jsonb
language plpgsql stable as $$
declare
  v_today    date := public.vn_today();
  v_start    date;
  v_next     date;
  v_ref      date;
  v_classes  integer;
  v_teachers integer;
  v_active   integer;
  v_new      integer;
  v_dropped  integer;
  v_revenue  bigint;
  v_charged  integer;
begin
  perform public.assert_manager();

  if p_year is null or p_month is null
     or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Tháng hoặc năm không hợp lệ.';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_next  := (v_start + interval '1 month')::date;

  if v_start > v_today then
    raise exception 'Trung tâm chưa có dữ liệu cho tháng trong tương lai.';
  end if;

  v_ref := least(v_today, v_next - 1);

  select count(*) into v_classes
  from public.classes c
  where (c.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_ref
    and (c.deleted_at is null
         or (c.deleted_at at time zone 'Asia/Ho_Chi_Minh')::date > v_ref);

  select count(*) into v_teachers
  from public.teachers t
  where (t.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_ref
    and (t.deleted_at is null
         or (t.deleted_at at time zone 'Asia/Ho_Chi_Minh')::date > v_ref);

  with spans as materialized (
    select student_id, entry_date, exit_date
    from public.student_presence_spans()
  ),
  active_set as (
    select distinct student_id
    from spans
    where entry_date <= v_ref and exit_date > v_ref
  )
  select
    (select count(*) from active_set),
    count(distinct s.student_id) filter (where s.entry_date between v_start and v_ref),
    count(distinct s.student_id) filter (
      where s.exit_date between v_start and v_ref
        and not exists (select 1 from active_set a where a.student_id = s.student_id)
    )
  into v_active, v_new, v_dropped
  from spans s;

  select coalesce(sum(a.price_snapshot) filter (where a.status <> 'absent_excused'), 0),
         count(*) filter (where a.status <> 'absent_excused')
  into v_revenue, v_charged
  from public.attendance_records a
  where a.attendance_date >= v_start and a.attendance_date < v_next;

  return jsonb_build_object(
    'month_start',      v_start,
    'as_of',            v_ref,
    'class_count',      v_classes,
    'teacher_count',    v_teachers,
    'student_count',    v_active,
    'new_students',     v_new,
    'dropped_students', v_dropped,
    'revenue',          v_revenue,
    'charged_sessions', v_charged
  );
end;
$$;

-- 2.10 dashboard_schedule: Lịch học trong ngày
create or replace function public.dashboard_schedule(p_date date)
returns jsonb
language plpgsql stable as $$
declare
  v_result jsonb;
begin
  perform public.assert_manager();

  if p_date is null then
    raise exception 'Vui lòng chọn ngày xem lịch học.';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'class_id',      x.class_id,
               'name',          x.name,
               'subject',       x.subject,
               'grade',         x.grade,
               'teacher_name',  x.teacher_name,
               'start_time',    x.start_time,
               'end_time',      x.end_time,
               'total_count',   x.total_count,
               'marked_count',  x.marked_count
             )
             order by x.start_time, x.name
           ),
           '[]'::jsonb
         )
  into v_result
  from (
    select c.id as class_id,
           c.name,
           c.subject,
           public.class_effective_grade(c.id) as grade,
           t.full_name as teacher_name,
           s.start_time,
           s.end_time,
           (
             select count(*) from (
               select e.student_id
               from public.class_enrollments e
               where e.class_id = c.id
                 and e.joined_at <= p_date
                 and (e.left_at is null or e.left_at >= p_date)
               union
               select a.student_id
               from public.attendance_records a
               where a.class_id = c.id and a.attendance_date = p_date
             ) u
           ) as total_count,
           (
             select count(*) from public.attendance_records a
             where a.class_id = c.id and a.attendance_date = p_date
           ) as marked_count
    from public.classes c
    join public.class_schedules s
      on s.class_id = c.id
     and s.day_of_week = public.vn_day_of_week(p_date)
    left join public.teachers t on t.id = c.teacher_id
    where c.deleted_at is null
  ) x;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';
