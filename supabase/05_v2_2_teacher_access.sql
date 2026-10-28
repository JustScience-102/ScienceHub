-- =====================================================================
-- Trung tâm ScienceHub - FILE 05: V2-2 TÀI KHOẢN GIÁO VIÊN & PHÂN QUYỀN THEO LỚP
-- Chạy SAU 04_lockdown_rls.sql. An toàn khi chạy lại nhiều lần (idempotent).
-- KHÔNG chạy lại 03_rpc_and_auth.sql sau file này (file 03 sẽ ghi đè các hàm đã nâng cấp ở đây).
--
-- Nội dung:
--   0. Dọn việc tồn đọng V2-1 (thu quyền anon của 2 hàm tiện ích).
--   1. Hàm trợ giúp RLS cho Giáo viên (SECURITY DEFINER, tránh đệ quy RLS giữa các bảng).
--   2. Policy RLS chỉ-đọc cho Giáo viên (mọi thao tác ghi đi qua RPC).
--   3. RPC quản lý tài khoản Giáo viên (chỉ Quản lý): link_teacher_account, set_teacher_account_active.
--   4. Hàm mới: assert_staff, lookup_parent_by_phone, enroll_existing_student, set_class_hidden.
--   5. Nâng cấp 8 RPC cũ để mở nhánh Giáo viên: save_class, update_student,
--      register_student_in_class, drop_enrollment, transfer_enrollment, save_attendance,
--      record_makeup, dashboard_summary.
--   6. Chốt quyền EXECUTE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Dọn việc tồn đọng V2-1
--    Hai hàm này được trigger gọi bằng quyền người dùng nên vẫn cấp cho authenticated.
-- ---------------------------------------------------------------------
revoke execute on function public.sync_parent_visibility(uuid) from anon, public;
revoke execute on function public.class_effective_grade(uuid)  from anon, public;
grant  execute on function public.sync_parent_visibility(uuid) to authenticated;
grant  execute on function public.class_effective_grade(uuid)  to authenticated;

-- ---------------------------------------------------------------------
-- 1. Hàm trợ giúp RLS cho Giáo viên
--    SECURITY DEFINER nên đọc các bảng mà không kích hoạt RLS, nhờ đó các policy của
--    class_enrollments / attendance_records / students / parents không gọi vòng nhau.
--    current_teacher_id() trả NULL nếu không phải Giáo viên hợp lệ => mọi hàm dưới đây trả false.
-- ---------------------------------------------------------------------
create or replace function public.teacher_owns_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.teacher_id = (select public.current_teacher_id())
  );
$$;

create or replace function public.teacher_owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where e.id = p_enrollment_id
      and c.teacher_id = (select public.current_teacher_id())
  );
$$;

-- Ghi danh Giáo viên được xem: thuộc lớp mình dạy, hoặc có điểm danh (học bù) tại lớp mình dạy.
create or replace function public.teacher_sees_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.teacher_owns_enrollment(p_enrollment_id)
      or exists (
        select 1
        from public.attendance_records ar
        join public.classes c on c.id = ar.class_id
        where ar.enrollment_id = p_enrollment_id
          and c.teacher_id = (select public.current_teacher_id())
      );
$$;

-- Học sinh Giáo viên được xem: có ghi danh (mọi trạng thái) ở lớp mình dạy,
-- hoặc có điểm danh tại lớp mình dạy.
create or replace function public.teacher_sees_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from public.class_enrollments ce
           join public.classes c on c.id = ce.class_id
           where ce.student_id = p_student_id
             and c.teacher_id = (select public.current_teacher_id())
         )
      or exists (
           select 1
           from public.attendance_records ar
           join public.classes c on c.id = ar.class_id
           where ar.student_id = p_student_id
             and c.teacher_id = (select public.current_teacher_id())
         );
$$;

-- Phụ huynh Giáo viên được xem: có ít nhất 1 con mà Giáo viên được xem.
create or replace function public.teacher_sees_parent(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.parent_id = p_parent_id
      and public.teacher_sees_student(s.id)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Policy RLS cho Giáo viên: CHỈ ĐỌC (SELECT). Mọi thao tác ghi đi qua RPC SECURITY DEFINER.
--    Quản lý vẫn dùng v2_manager_all như cũ.
-- ---------------------------------------------------------------------
drop policy if exists v2_teacher_select_self on public.teachers;
create policy v2_teacher_select_self on public.teachers
  for select to authenticated
  using ((select public.app_role()) = 'teacher' and id = (select public.current_teacher_id()));

drop policy if exists v2_teacher_select_own_classes on public.classes;
create policy v2_teacher_select_own_classes on public.classes
  for select to authenticated
  using ((select public.app_role()) = 'teacher' and teacher_id = (select public.current_teacher_id()));

-- Giáo viên KHÔNG có policy UPDATE trên classes: ẩn/khôi phục lớp đi qua set_class_hidden,
-- sửa lớp đi qua save_class (không sửa trực tiếp được tên, khối, đơn giá, giáo viên).
drop policy if exists v2_teacher_update_own_classes on public.classes;

drop policy if exists v2_teacher_select_own_schedules on public.class_schedules;
create policy v2_teacher_select_own_schedules on public.class_schedules
  for select to authenticated
  using (public.teacher_owns_class(class_id));

drop policy if exists v2_teacher_select_own_enrollments on public.class_enrollments;
create policy v2_teacher_select_own_enrollments on public.class_enrollments
  for select to authenticated
  using (public.teacher_sees_enrollment(id));

drop policy if exists v2_teacher_select_own_students on public.students;
create policy v2_teacher_select_own_students on public.students
  for select to authenticated
  using (public.teacher_sees_student(id));

drop policy if exists v2_teacher_select_own_parents on public.parents;
create policy v2_teacher_select_own_parents on public.parents
  for select to authenticated
  using (public.teacher_sees_parent(id));

drop policy if exists v2_teacher_select_own_attendance on public.attendance_records;
create policy v2_teacher_select_own_attendance on public.attendance_records
  for select to authenticated
  using (public.teacher_owns_class(class_id) or public.teacher_owns_enrollment(enrollment_id));

-- ---------------------------------------------------------------------
-- 3. RPC quản lý tài khoản Giáo viên (chỉ Quản lý gọi được)
-- ---------------------------------------------------------------------
create or replace function public.link_teacher_account(p_email text, p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text;
  v_user_id  uuid;
  v_deleted  timestamptz;
  v_prof     public.profiles%rowtype;
  v_replaced boolean := false;
begin
  perform public.assert_manager();

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Trung tâm: Vui lòng nhập email của tài khoản giáo viên.';
  end if;

  select t.deleted_at into v_deleted from public.teachers t where t.id = p_teacher_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
  end if;
  if v_deleted is not null then
    raise exception 'Trung tâm: Giáo viên này đang bị ẩn, vui lòng khôi phục giáo viên trước khi liên kết tài khoản.';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;
  if v_user_id is null then
    raise exception 'Trung tâm: Không tìm thấy tài khoản Authentication nào với email %. Vui lòng tạo người dùng trong Supabase Authentication trước.', v_email;
  end if;

  select * into v_prof from public.profiles where user_id = v_user_id;
  if found then
    if v_prof.role = 'manager' then
      raise exception 'Trung tâm: Email % đang là tài khoản Quản lý, không thể liên kết làm tài khoản Giáo viên.', v_email;
    end if;
    if v_prof.teacher_id is distinct from p_teacher_id then
      raise exception 'Trung tâm: Email % đang được liên kết với một giáo viên khác. Mỗi tài khoản chỉ gắn với một giáo viên.', v_email;
    end if;
  end if;

  -- Giáo viên đã gắn với một tài khoản khác: thay bằng tài khoản mới (tài khoản cũ mất quyền vào hệ thống).
  delete from public.profiles where teacher_id = p_teacher_id and user_id <> v_user_id;
  v_replaced := found;

  insert into public.profiles (user_id, role, teacher_id, active)
  values (v_user_id, 'teacher', p_teacher_id, true)
  on conflict (user_id) do update
    set role = 'teacher', teacher_id = excluded.teacher_id, active = true;

  update public.teachers set email = v_email where id = p_teacher_id;

  return jsonb_build_object(
    'user_id',    v_user_id,
    'email',      v_email,
    'role',       'teacher',
    'teacher_id', p_teacher_id,
    'active',     true,
    'replaced',   v_replaced
  );
end;
$$;

create or replace function public.set_teacher_account_active(p_teacher_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
begin
  perform public.assert_manager();

  if p_active is null then
    raise exception 'Trung tâm: Vui lòng chọn trạng thái tài khoản.';
  end if;

  select t.deleted_at into v_deleted from public.teachers t where t.id = p_teacher_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
  end if;
  if p_active and v_deleted is not null then
    raise exception 'Trung tâm: Giáo viên này đang bị ẩn, vui lòng khôi phục giáo viên trước khi mở khóa tài khoản.';
  end if;

  update public.profiles
  set active = p_active
  where teacher_id = p_teacher_id and role = 'teacher';
  if not found then
    raise exception 'Trung tâm: Giáo viên này chưa được liên kết tài khoản đăng nhập.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Hàm mới
-- ---------------------------------------------------------------------

-- Chốt chặn cho RPC mở cho cả Quản lý và Giáo viên. Trả về vai trò của người gọi.
create or replace function public.assert_staff()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
begin
  if v_role is null or v_role not in ('manager', 'teacher') then
    raise exception 'Trung tâm: Bạn cần đăng nhập bằng tài khoản Quản lý hoặc Giáo viên đang hoạt động để thực hiện thao tác này.';
  end if;
  return v_role;
end;
$$;

-- 4.1 Tra cứu phụ huynh theo SĐT: chỉ khớp chính xác 10 số, không tìm gần đúng (chống dò danh sách).
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
  v_phone    text := trim(coalesce(p_phone, ''));
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

  -- class_ids: các lớp 'active' của em đó. Giáo viên chỉ nhận lớp do chính mình phụ trách.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',                 s.id,
               'student_code',       s.student_code,
               'full_name',          s.full_name,
               'phone',              s.phone,
               'grade',              s.grade,
               'deleted_at',         s.deleted_at,
               'active_class_count', (
                 select count(*) from public.class_enrollments e
                 where e.student_id = s.id and e.status = 'active'
               ),
               'class_ids',          (
                 select coalesce(jsonb_agg(e.class_id), '[]'::jsonb)
                 from public.class_enrollments e
                 join public.classes c on c.id = e.class_id
                 where e.student_id = s.id
                   and e.status = 'active'
                   and (v_role = 'manager' or c.teacher_id = v_teacher)
               )
             )
             order by s.full_name, s.student_code
           ),
           '[]'::jsonb
         )
  into v_students
  from public.students s
  where s.parent_id = v_parent.id;

  return jsonb_build_object(
    'id',          v_parent.id,
    'parent_code', v_parent.parent_code,
    'full_name',   v_parent.full_name,
    'phone',       v_parent.phone,
    'deleted_at',  v_parent.deleted_at,
    'students',    v_students
  );
end;
$$;

-- 4.2 Ghi danh học sinh đã có vào lớp (thay cho INSERT trực tiếp từ trình duyệt).
--     Các trigger trong 02_triggers.sql vẫn kiểm tra cùng khối, lớp chưa ẩn và tự hiện lại học sinh/phụ huynh.
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
  v_class  public.classes%rowtype;
  v_joined date := coalesce(p_joined_at, public.vn_today());
  v_id     uuid;
begin
  if p_class_id is null then
    raise exception 'Trung tâm: Vui lòng chọn lớp.';
  end if;
  if p_student_id is null or not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Trung tâm: Không tìm thấy học sinh.';
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;

  if v_role = 'teacher' then
    if v_class.teacher_id is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn chỉ được thêm học sinh vào lớp do mình phụ trách.';
    end if;
    if v_joined < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi danh học sinh với ngày vào lớp nằm trong tháng hiện tại.';
    end if;
  end if;

  if v_class.deleted_at is not null then
    raise exception 'Trung tâm: Lớp này đã bị ẩn. Hãy khôi phục lớp trước khi thêm học sinh.';
  end if;

  insert into public.class_enrollments (class_id, student_id, status, joined_at)
  values (p_class_id, p_student_id, 'active', v_joined)
  returning id into v_id;

  return v_id;
end;
$$;

-- 4.3 Ẩn / khôi phục lớp (Giáo viên chỉ với lớp của mình). Trigger vẫn chặn ẩn lớp còn học sinh 'active'.
--     Khi khôi phục có thể kèm tên và STT mới (để tránh trùng tên với lớp đang hiển thị).
create or replace function public.set_class_hidden(
  p_class_id   uuid,
  p_hidden     boolean,
  p_new_name   text default null,
  p_new_class_no integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.assert_staff();
  v_class public.classes%rowtype;
begin
  if p_hidden is null then
    raise exception 'Trung tâm: Vui lòng chọn ẩn hoặc khôi phục lớp.';
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy lớp học.';
  end if;

  if v_role = 'teacher' and v_class.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'Trung tâm: Bạn không có quyền chỉnh sửa lớp của giáo viên khác.';
  end if;

  if p_hidden then
    update public.classes set deleted_at = now() where id = p_class_id;
  else
    update public.classes
    set deleted_at = null,
        name       = coalesce(nullif(trim(coalesce(p_new_name, '')), ''), name),
        class_no   = coalesce(p_new_class_no, class_no)
    where id = p_class_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Nâng cấp các RPC cũ: mở nhánh Giáo viên (giữ nguyên toàn bộ logic của bản gốc ở file 03)
--    Mọi hàm chuyển sang SECURITY DEFINER + search_path cố định, tự kiểm tra vai trò/phạm vi ngay đầu hàm.
-- ---------------------------------------------------------------------

-- 5.1 save_class: Quản lý toàn quyền; Giáo viên chỉ tạo/sửa lớp của chính mình
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.assert_staff();
  v_me    uuid := public.current_teacher_id();
  v_owner uuid;
  v_id    uuid;
  v_item  jsonb;
  v_day   integer;
  v_start time;
  v_end   time;
  v_days  integer[] := '{}';
begin
  if v_role = 'teacher' then
    if p_teacher_id is distinct from v_me then
      raise exception 'Trung tâm: Giáo viên chỉ được tạo hoặc chỉnh sửa lớp của chính mình, không thể chuyển lớp cho giáo viên khác.';
    end if;
    if p_class_id is not null then
      select c.teacher_id into v_owner from public.classes c where c.id = p_class_id;
      if not found or v_owner is distinct from v_me then
        raise exception 'Trung tâm: Bạn không có quyền chỉnh sửa lớp của giáo viên khác.';
      end if;
    end if;
  end if;

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

-- 5.2 update_student: Giáo viên chỉ sửa học sinh đang học lớp mình và KHÔNG được đổi tên phụ huynh.
--     Nhập SĐT phụ huynh đã có => học sinh gắn vào phụ huynh đó (tên lấy từ hồ sơ, không sửa).
--     SĐT chưa có => nếu phụ huynh hiện tại chỉ có 1 con thì đổi SĐT của phụ huynh đó (giữ tên),
--     ngược lại tạo phụ huynh mới (cần họ tên).
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
  v_current_parent uuid;
  v_found_parent   uuid;
  v_new_parent     uuid;
  v_child_count    integer;
begin
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

  if v_role = 'teacher' and not exists (
    select 1
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where ce.student_id = p_student_id
      and ce.status = 'active'
      and c.teacher_id = public.current_teacher_id()
  ) then
    raise exception 'Trung tâm: Bạn chỉ được chỉnh sửa thông tin học sinh thuộc lớp mình phụ trách.';
  end if;

  select id into v_found_parent from public.parents where phone = trim(p_parent_phone);

  if v_found_parent is not null then
    v_new_parent := v_found_parent;
    if v_role = 'manager'
       and v_found_parent = v_current_parent
       and coalesce(trim(p_parent_name), '') <> '' then
      update public.parents set full_name = trim(p_parent_name) where id = v_found_parent;
    end if;
  else
    select count(*) into v_child_count
    from public.students where parent_id = v_current_parent;

    if v_role = 'teacher' and v_current_parent is not null and v_child_count = 1 then
      -- Giữ nguyên tên phụ huynh, chỉ đổi SĐT (phụ huynh này chỉ có đúng em đang sửa).
      update public.parents
      set phone = trim(p_parent_phone)
      where id = v_current_parent;
      v_new_parent := v_current_parent;
    else
      if coalesce(trim(p_parent_name), '') = '' then
        raise exception 'Vui lòng nhập họ tên phụ huynh.';
      end if;

      if v_role = 'manager' and v_current_parent is not null and v_child_count = 1 then
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
  end if;

  update public.students
  set full_name = trim(p_full_name),
      phone     = nullif(trim(coalesce(p_phone, '')), ''),
      parent_id = v_new_parent
  where id = p_student_id;
end;
$$;

-- 5.3 register_student_in_class: Giáo viên chỉ thêm vào lớp của mình, ngày vào lớp trong tháng hiện tại.
--     Phụ huynh đã có theo SĐT thì dùng lại và KHÔNG sửa tên (giống bản gốc).
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
  v_role       text := public.assert_staff();
  v_owner      uuid;
  v_joined     date := coalesce(p_joined_at, public.vn_today());
  v_parent_id  uuid;
  v_student_id uuid;
begin
  if p_class_id is null then
    raise exception 'Vui lòng chọn lớp cho học sinh.';
  end if;

  if v_role = 'teacher' then
    select c.teacher_id into v_owner from public.classes c where c.id = p_class_id;
    if not found or v_owner is distinct from public.current_teacher_id() then
      raise exception 'Trung tâm: Bạn chỉ được thêm học sinh vào lớp do mình phụ trách.';
    end if;
    if v_joined < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi danh học sinh với ngày vào lớp nằm trong tháng hiện tại.';
    end if;
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
  values (p_class_id, v_student_id, v_joined);

  return v_student_id;
end;
$$;

-- 5.4 drop_enrollment: Giáo viên chỉ cho nghỉ học sinh ở lớp mình, ngày nghỉ trong tháng hiện tại
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
    if not public.teacher_owns_enrollment(p_enrollment_id) then
      raise exception 'Trung tâm: Bạn chỉ được cho nghỉ học sinh ở lớp do mình phụ trách.';
    end if;
    if coalesce(p_left_at, public.vn_today()) < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được cho học sinh nghỉ với ngày nghỉ nằm trong tháng hiện tại.';
    end if;
  end if;

  return public._drop_enrollment_core(p_enrollment_id, p_left_at, p_delete_attendance);
end;
$$;

-- 5.5 transfer_enrollment: Giáo viên chỉ chuyển giữa 2 lớp cùng khối, cùng môn, cùng do mình dạy, trong tháng hiện tại
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
  v_role  text := public.assert_staff();
  v_old   public.class_enrollments%rowtype;
  v_oldc  public.classes%rowtype;
  v_new   public.classes%rowtype;
  v_today date := public.vn_today();
  v_later integer;
begin
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

-- 5.6 save_attendance: Giáo viên chỉ điểm danh lớp mình, trong tháng hiện tại
create or replace function public.save_attendance(
  p_class_id uuid,
  p_date     date,
  p_items    jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.assert_staff();
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
  if p_date is null then
    raise exception 'Vui lòng chọn ngày điểm danh.';
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'Không tìm thấy lớp học.';
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

    if v_role = 'teacher' and not public.teacher_owns_enrollment(v_enr_id) then
      raise exception 'Trung tâm: Bạn chỉ được điểm danh cho lớp mình phụ trách.';
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

-- 5.7 record_makeup: Giáo viên chỉ ghi học bù giữa 2 lớp của chính mình, cả 2 ngày trong tháng hiện tại
create or replace function public.record_makeup(
  p_makeup_class_id uuid,
  p_date            date,
  p_enrollment_id   uuid,
  p_original_date   date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.assert_staff();
  v_me       uuid := public.current_teacher_id();
  v_today    date := public.vn_today();
  v_enr      public.class_enrollments%rowtype;
  v_orig     public.classes%rowtype;
  v_make     public.classes%rowtype;
  v_orig_rec public.attendance_records%rowtype;
  v_found    boolean;
begin
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

  if v_role = 'teacher' then
    if v_orig.teacher_id is distinct from v_me or v_make.teacher_id is distinct from v_me then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi học bù giữa các lớp do chính mình phụ trách.';
    end if;
    if p_date < public.vn_month_start() or p_original_date < public.vn_month_start() then
      raise exception 'Trung tâm: Giáo viên chỉ được ghi nhận học bù cho các buổi học trong tháng hiện tại.';
    end if;
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

-- 5.8 dashboard_summary: Quản lý giữ nguyên 6 chỉ số; Giáo viên nhận số liệu riêng của các lớp mình dạy.
--     Giữ nguyên tên khóa JSON cũ để frontend dùng chung parseSummary():
--       class_count   = số lớp đang hiển thị của giáo viên (hiện tại)
--       student_count = số học sinh 'active' không trùng trong các lớp đó (hiện tại)
--       revenue / charged_sessions = theo tháng (p_year, p_month) ở các lớp giáo viên phụ trách
--     Nhánh Giáo viên không gọi student_presence_spans() (hàm đó chỉ trả dữ liệu cho Quản lý).
create or replace function public.dashboard_summary(p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role     text := public.assert_staff();
  v_me       uuid := public.current_teacher_id();
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

  if v_role = 'teacher' then
    select count(*) into v_classes
    from public.classes c
    where c.teacher_id = v_me and c.deleted_at is null;

    select count(distinct e.student_id) into v_active
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where c.teacher_id = v_me and c.deleted_at is null and e.status = 'active';

    select coalesce(sum(a.price_snapshot) filter (where a.status <> 'absent_excused'), 0),
           count(*) filter (where a.status <> 'absent_excused')
    into v_revenue, v_charged
    from public.attendance_records a
    join public.classes c on c.id = a.class_id
    where c.teacher_id = v_me
      and a.attendance_date >= v_start and a.attendance_date < v_next;

    return jsonb_build_object(
      'month_start',      v_start,
      'as_of',            v_ref,
      'class_count',      v_classes,
      'teacher_count',    1,
      'student_count',    v_active,
      'new_students',     0,
      'dropped_students', 0,
      'revenue',          v_revenue,
      'charged_sessions', v_charged
    );
  end if;

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

-- ---------------------------------------------------------------------
-- 6. Chốt quyền EXECUTE: chỉ authenticated; anon và public bị thu hồi
-- ---------------------------------------------------------------------
revoke execute on function public.teacher_owns_class(uuid)                                                       from anon, public;
revoke execute on function public.teacher_owns_enrollment(uuid)                                                  from anon, public;
revoke execute on function public.teacher_sees_enrollment(uuid)                                                  from anon, public;
revoke execute on function public.teacher_sees_student(uuid)                                                     from anon, public;
revoke execute on function public.teacher_sees_parent(uuid)                                                      from anon, public;
revoke execute on function public.assert_staff()                                                                 from anon, public;
revoke execute on function public.link_teacher_account(text, uuid)                                               from anon, public;
revoke execute on function public.set_teacher_account_active(uuid, boolean)                                      from anon, public;
revoke execute on function public.lookup_parent_by_phone(text)                                                   from anon, public;
revoke execute on function public.enroll_existing_student(uuid, uuid, date)                                      from anon, public;
revoke execute on function public.set_class_hidden(uuid, boolean, text, integer)                                 from anon, public;
revoke execute on function public.save_class(uuid, text, text, integer, integer, uuid, integer, jsonb, boolean)  from anon, public;
revoke execute on function public.update_student(uuid, text, text, text, text)                                   from anon, public;
revoke execute on function public.register_student_in_class(uuid, date, text, text, text, text)                  from anon, public;
revoke execute on function public.drop_enrollment(uuid, date, boolean)                                           from anon, public;
revoke execute on function public.transfer_enrollment(uuid, uuid, date, boolean)                                 from anon, public;
revoke execute on function public.save_attendance(uuid, date, jsonb)                                             from anon, public;
revoke execute on function public.record_makeup(uuid, date, uuid, date)                                          from anon, public;
revoke execute on function public.dashboard_summary(integer, integer)                                            from anon, public;

grant execute on function public.teacher_owns_class(uuid)                                                        to authenticated;
grant execute on function public.teacher_owns_enrollment(uuid)                                                   to authenticated;
grant execute on function public.teacher_sees_enrollment(uuid)                                                   to authenticated;
grant execute on function public.teacher_sees_student(uuid)                                                      to authenticated;
grant execute on function public.teacher_sees_parent(uuid)                                                       to authenticated;
grant execute on function public.assert_staff()                                                                  to authenticated;
grant execute on function public.link_teacher_account(text, uuid)                                                to authenticated;
grant execute on function public.set_teacher_account_active(uuid, boolean)                                       to authenticated;
grant execute on function public.lookup_parent_by_phone(text)                                                    to authenticated;
grant execute on function public.enroll_existing_student(uuid, uuid, date)                                       to authenticated;
grant execute on function public.set_class_hidden(uuid, boolean, text, integer)                                  to authenticated;
grant execute on function public.save_class(uuid, text, text, integer, integer, uuid, integer, jsonb, boolean)   to authenticated;
grant execute on function public.update_student(uuid, text, text, text, text)                                    to authenticated;
grant execute on function public.register_student_in_class(uuid, date, text, text, text, text)                   to authenticated;
grant execute on function public.drop_enrollment(uuid, date, boolean)                                            to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid, date, boolean)                                  to authenticated;
grant execute on function public.save_attendance(uuid, date, jsonb)                                              to authenticated;
grant execute on function public.record_makeup(uuid, date, uuid, date)                                           to authenticated;
grant execute on function public.dashboard_summary(integer, integer)                                             to authenticated;

notify pgrst, 'reload schema';
