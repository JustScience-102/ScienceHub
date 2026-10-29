-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 02: VAI TRÒ, PHẠM VI GIÁO VIÊN, RLS & NHẬT KÝ
-- Chạy sau 01_tables.sql. Chạy lại an toàn.
--
-- Nguyên tắc V3:
--   * authenticated CHỈ có quyền SELECT (RLS lọc dòng). Mọi thao tác ghi, kể cả của Quản lý,
--     đi qua RPC SECURITY DEFINER tự kiểm tra vai trò (file 05, 06, 08).
--   * Phạm vi của Giáo viên tính một lần cho mỗi truy vấn (my_*_ids trả mảng uuid, bọc trong
--     (select ...) nên Postgres chạy 1 lần), không gọi hàm theo từng dòng như V2.
--   * Không có policy mở nào. Quản lý đầu tiên tạo bằng bootstrap_manager.sql trong SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vai trò của người đang gọi
--    app_role(): 'manager' | 'teacher' | NULL (chưa đăng nhập, tài khoản bị khóa, giáo viên bị ẩn,
--    hoặc phiên Giáo viên quá 48 giờ kể từ lần đăng nhập gần nhất).
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
  v_last    timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  select p.role, p.teacher_id, p.active into v_role, v_teacher, v_active
  from public.profiles p
  where p.user_id = v_uid;

  if not found or not coalesce(v_active, false) then
    return null;
  end if;

  if v_role = 'teacher' then
    if not exists (select 1 from public.teachers t where t.id = v_teacher and t.deleted_at is null) then
      return null;
    end if;
    select u.last_sign_in_at into v_last from auth.users u where u.id = v_uid;
    if v_last is null or now() - v_last > interval '48 hours' then
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
language sql
stable
security definer
set search_path = public
as $$
  select p.teacher_id
  from public.profiles p
  where p.user_id = auth.uid()
    and public.app_role() = 'teacher';
$$;

create or replace function public.assert_manager()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Trung tâm: Chỉ Quản lý mới có quyền thực hiện thao tác này.';
  end if;
end;
$$;

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
  if v_role is null then
    raise exception 'Trung tâm: Bạn cần đăng nhập bằng tài khoản Quản lý hoặc Giáo viên đang hoạt động để thực hiện thao tác này.';
  end if;
  return v_role;
end;
$$;

-- Hồ sơ phiên đăng nhập cho giao diện (status: ok | no_profile | inactive | teacher_hidden | expired)
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
  v_prof     public.profiles%rowtype;
  v_tname    text;
  v_tdeleted timestamptz;
  v_expires  timestamptz;
  v_status   text;
begin
  if v_uid is null then
    return null;
  end if;

  select u.email, u.last_sign_in_at into v_email, v_last from auth.users u where u.id = v_uid;
  select * into v_prof from public.profiles p where p.user_id = v_uid;

  if not found then
    return jsonb_build_object(
      'user_id', v_uid, 'email', v_email, 'role', null, 'teacher_id', null, 'teacher_name', null,
      'active', false, 'last_sign_in_at', v_last, 'expires_at', null, 'status', 'no_profile'
    );
  end if;

  if v_prof.role = 'teacher' then
    select t.full_name, t.deleted_at into v_tname, v_tdeleted from public.teachers t where t.id = v_prof.teacher_id;
    if v_last is not null then
      v_expires := v_last + interval '48 hours';
    end if;
  end if;

  v_status := case
    when not v_prof.active then 'inactive'
    when v_prof.role = 'teacher' and v_tdeleted is not null then 'teacher_hidden'
    when v_prof.role = 'teacher' and (v_expires is null or now() > v_expires) then 'expired'
    else 'ok'
  end;

  return jsonb_build_object(
    'user_id', v_uid, 'email', v_email, 'role', v_prof.role, 'teacher_id', v_prof.teacher_id,
    'teacher_name', v_tname, 'active', v_prof.active, 'last_sign_in_at', v_last,
    'expires_at', v_expires, 'status', v_status
  );
end;
$$;

-- Tạo Quản lý (chỉ chạy trong SQL Editor; API không gọi được - xem 09_grants.sql).
create or replace function public.setup_initial_manager(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'Trung tâm: Vui lòng nhập email của Quản lý.';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'Trung tâm: Không tìm thấy tài khoản có email % trong Supabase Authentication. Hãy tạo user trong Dashboard trước.', btrim(p_email);
  end if;

  if exists (select 1 from public.profiles where user_id = v_uid and role = 'teacher') then
    raise exception 'Trung tâm: Email % đang là tài khoản Giáo viên, không thể đặt làm Quản lý.', btrim(p_email);
  end if;

  insert into public.profiles (user_id, role, teacher_id, active)
  values (v_uid, 'manager', null, true)
  on conflict (user_id) do update set role = 'manager', teacher_id = null, active = true;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Phạm vi dữ liệu của Giáo viên (mảng rỗng nếu không phải Giáo viên hợp lệ)
-- ---------------------------------------------------------------------
create or replace function public.my_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(c.id), '{}')
  from public.classes c
  where c.teacher_id = (select public.current_teacher_id());
$$;

-- Ghi danh thuộc lớp của mình.
create or replace function public.my_owned_enrollment_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(e.id), '{}')
  from public.class_enrollments e
  join public.classes c on c.id = e.class_id
  where c.teacher_id = (select public.current_teacher_id());
$$;

-- Ghi danh được xem: thuộc lớp của mình, hoặc có buổi (học bù) tại lớp của mình.
create or replace function public.my_visible_enrollment_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_teacher_id() as id)
  select coalesce(array_agg(distinct x.id), '{}')
  from (
    select e.id
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where c.teacher_id = (select id from me)
    union
    select a.enrollment_id
    from public.attendance_records a
    join public.classes c on c.id = a.class_id
    where c.teacher_id = (select id from me)
  ) x;
$$;

-- Học sinh được xem: có ghi danh (mọi trạng thái) hoặc có điểm danh tại lớp của mình.
create or replace function public.my_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_teacher_id() as id)
  select coalesce(array_agg(distinct x.id), '{}')
  from (
    select e.student_id as id
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where c.teacher_id = (select id from me)
    union
    select a.student_id
    from public.attendance_records a
    join public.classes c on c.id = a.class_id
    where c.teacher_id = (select id from me)
  ) x;
$$;

create or replace function public.my_parent_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct s.parent_id), '{}')
  from public.students s
  where s.id = any ((select public.my_student_ids())::uuid[]) and s.parent_id is not null;
$$;

-- ---------------------------------------------------------------------
-- 3. Policy: một policy SELECT cho mỗi bảng. Không có policy INSERT/UPDATE/DELETE nào.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Gỡ mọi policy cũ trên các bảng của Trung tâm để bộ policy luôn đúng như file này.
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'parents', 'teachers', 'students', 'classes', 'class_schedules', 'class_enrollments',
      'attendance_records', 'profiles', 'class_versions', 'month_closures', 'audit_log',
      'restore_staging', 'schema_migrations')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy v3_select on public.parents for select to authenticated
  using ((select public.is_manager()) or id = any ((select public.my_parent_ids())::uuid[]));

create policy v3_select on public.teachers for select to authenticated
  using ((select public.is_manager()) or id = (select public.current_teacher_id()));

create policy v3_select on public.students for select to authenticated
  using ((select public.is_manager()) or id = any ((select public.my_student_ids())::uuid[]));

create policy v3_select on public.classes for select to authenticated
  using ((select public.is_manager()) or teacher_id = (select public.current_teacher_id()));

create policy v3_select on public.class_schedules for select to authenticated
  using ((select public.is_manager()) or class_id = any ((select public.my_class_ids())::uuid[]));

create policy v3_select on public.class_enrollments for select to authenticated
  using ((select public.is_manager()) or id = any ((select public.my_visible_enrollment_ids())::uuid[]));

create policy v3_select on public.attendance_records for select to authenticated
  using (
    (select public.is_manager())
    or class_id = any ((select public.my_class_ids())::uuid[])
    or enrollment_id = any ((select public.my_owned_enrollment_ids())::uuid[])
  );

create policy v3_select on public.profiles for select to authenticated
  using ((select public.is_manager()) or user_id = (select auth.uid()));

create policy v3_select on public.class_versions for select to authenticated
  using ((select public.is_manager()) or class_id = any ((select public.my_class_ids())::uuid[]));

create policy v3_select on public.month_closures for select to authenticated
  using ((select public.app_role()) is not null);

create policy v3_select on public.audit_log for select to authenticated
  using ((select public.is_manager()));

-- ---------------------------------------------------------------------
-- 4. Ghi nhật ký (dùng chung cho trigger và RPC). Người thực hiện lấy từ auth.uid().
-- ---------------------------------------------------------------------
create or replace function public._audit_action_group(p_action text)
returns text
language sql
immutable
as $$
  select case
    when p_action in ('attendance_create', 'attendance_update', 'attendance_delete') then 'attendance'
    when p_action in ('makeup_record', 'makeup_cancel') then 'makeup'
    when p_action in ('enrollment_create', 'enrollment_drop', 'enrollment_transfer', 'enrollment_graduate') then 'enrollment'
    when p_action in ('class_create', 'class_update', 'class_hide', 'class_restore', 'class_schedule_update') then 'class'
    when p_action in ('student_create', 'student_update', 'student_hide', 'student_restore', 'parent_update') then 'student'
    when p_action in ('teacher_create', 'teacher_update', 'teacher_hide', 'teacher_restore',
                      'teacher_account_link', 'teacher_account_unlink',
                      'teacher_account_lock', 'teacher_account_unlock') then 'teacher'
    when p_action in ('backup_export', 'audit_log_clear', 'school_year_rollover', 'center_restore',
                      'month_close', 'month_reopen') then 'system'
    else 'other'
  end;
$$;

create or replace function public._write_audit_log(
  p_action     text,
  p_table_name text,
  p_record_id  uuid,
  p_class_id   uuid,
  p_student_id uuid,
  p_summary    text,
  p_old_data   jsonb,
  p_new_data   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_role       text;
  v_teacher_id uuid;
  v_actor_name text;
  v_email      text;
  v_tname      text;
begin
  if v_uid is not null then
    select p.role, p.teacher_id into v_role, v_teacher_id from public.profiles p where p.user_id = v_uid;
    select u.email into v_email from auth.users u where u.id = v_uid;

    if v_role = 'teacher' and v_teacher_id is not null then
      select t.full_name into v_tname from public.teachers t where t.id = v_teacher_id;
      v_actor_name := coalesce('GV ' || v_tname, v_email, 'Giáo viên');
    elsif v_role = 'manager' then
      v_teacher_id := null;
      v_actor_name := coalesce('Quản lý (' || v_email || ')', 'Quản lý');
    else
      v_role       := 'system';
      v_teacher_id := null;
      v_actor_name := coalesce(v_email, 'Hệ thống');
    end if;
  else
    v_role       := 'system';
    v_actor_name := 'Hệ thống (SQL)';
  end if;

  insert into public.audit_log (
    actor_user_id, actor_role, actor_teacher_id, actor_name, action, action_group,
    table_name, record_id, class_id, student_id, summary, old_data, new_data
  ) values (
    v_uid, v_role, v_teacher_id, v_actor_name, p_action, public._audit_action_group(p_action),
    p_table_name, p_record_id, p_class_id, p_student_id, p_summary, p_old_data, p_new_data
  );
end;
$$;
