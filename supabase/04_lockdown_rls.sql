-- =====================================================================
-- Trung tâm ScienceHub - FILE 04: KHÓA QUYỀN RLS & THU HỒI QUYỀN ANON
-- CHỈ CHẠY FILE NÀY SAU KHI:
--   1. Đã chạy 01_schema.sql, 02_triggers.sql, 03_rpc_and_auth.sql
--   2. Đã tạo user trong Supabase Authentication
--   3. Đã chạy: select public.setup_initial_manager('email_cua_ban@...');
--   4. Đã đăng nhập thử thành công trên giao diện web.
--
-- Điểm cải tiến:
--   * Không cần khai báo lại 10 hàm RPC (vì đã có assert_manager ở File 03).
--   * Tất cả RLS Policy đều bọc (select public.is_manager()) để PostgreSQL
--     chạy InitPlan 1 lần duy nhất cho mỗi truy vấn thay vì chạy lại trên từng dòng.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Chốt an toàn: Tự dừng nếu chưa có tài khoản Quản lý hoạt động
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Trung tâm: Chưa có bảng profiles. Hãy chạy 01_schema.sql -> 03_rpc_and_auth.sql trước.';
  end if;

  if not exists (
    select 1 from public.profiles where role = 'manager' and active = true
  ) then
    raise exception 'Trung tâm: Chưa có tài khoản Quản lý nào đang hoạt động trong bảng profiles. Hãy chạy select public.setup_initial_manager(''email_cua_ban''); và đăng nhập thử trên web trước khi khóa quyền.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Thay policy v1_open_access bằng v2_manager_all (bọc subselect tối ưu)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'parents', 'teachers', 'students', 'classes',
    'class_schedules', 'class_enrollments', 'attendance_records'
  ]) loop
    execute format('drop policy if exists v1_open_access on public.%I', t);
    execute format('drop policy if exists v2_manager_all on public.%I', t);
    execute format(
      'create policy v2_manager_all on public.%I for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()))',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Gỡ quyền EXECUTE của anon/public, chỉ cấp cho authenticated
-- ---------------------------------------------------------------------
revoke execute on function public.update_student(uuid, text, text, text, text)                                 from anon, public;
revoke execute on function public.save_class(uuid, text, text, integer, integer, uuid, integer, jsonb, boolean) from anon, public;
revoke execute on function public.register_student_in_class(uuid, date, text, text, text, text)                from anon, public;
revoke execute on function public.drop_enrollment(uuid, date, boolean)                                         from anon, public;
revoke execute on function public.transfer_enrollment(uuid, uuid, date, boolean)                               from anon, public;
revoke execute on function public.save_attendance(uuid, date, jsonb)                                           from anon, public;
revoke execute on function public.record_makeup(uuid, date, uuid, date)                                        from anon, public;
revoke execute on function public.student_presence_spans()                                                     from anon, public;
revoke execute on function public.dashboard_summary(integer, integer)                                          from anon, public;
revoke execute on function public.dashboard_schedule(date)                                                     from anon, public;
revoke execute on function public.app_role()                                                                   from anon, public;
revoke execute on function public.is_manager()                                                                 from anon, public;
revoke execute on function public.current_teacher_id()                                                         from anon, public;
revoke execute on function public.my_profile()                                                                 from anon, public;
revoke execute on function public.assert_manager()                                                             from anon, public;

grant execute on function public.update_student(uuid, text, text, text, text)                                 to authenticated;
grant execute on function public.save_class(uuid, text, text, integer, integer, uuid, integer, jsonb, boolean) to authenticated;
grant execute on function public.register_student_in_class(uuid, date, text, text, text, text)                to authenticated;
grant execute on function public.drop_enrollment(uuid, date, boolean)                                         to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid, date, boolean)                               to authenticated;
grant execute on function public.save_attendance(uuid, date, jsonb)                                           to authenticated;
grant execute on function public.record_makeup(uuid, date, uuid, date)                                        to authenticated;
grant execute on function public.student_presence_spans()                                                     to authenticated;
grant execute on function public.dashboard_summary(integer, integer)                                          to authenticated;
grant execute on function public.dashboard_schedule(date)                                                     to authenticated;
grant execute on function public.app_role()                                                                   to authenticated;
grant execute on function public.is_manager()                                                                 to authenticated;
grant execute on function public.current_teacher_id()                                                         to authenticated;
grant execute on function public.my_profile()                                                                 to authenticated;
grant execute on function public.assert_manager()                                                             to authenticated;

notify pgrst, 'reload schema';
