-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 09: CẤP QUYỀN (CHẠY CUỐI CÙNG)
-- Chạy sau cùng trong bộ V3 và chạy lại sau MỖI lần thêm/sửa hàm hoặc bảng. Chạy lại an toàn.
--
-- Quy ước quyền duy nhất của Trung tâm:
--   * anon (chưa đăng nhập): không có quyền gì trên schema public.
--   * authenticated: chỉ SELECT trên các bảng nghiệp vụ (RLS lọc dòng), không INSERT/UPDATE/DELETE.
--   * Hàm: authenticated được gọi mọi hàm có tên KHÔNG bắt đầu bằng "_" (RPC và hàm tra cứu),
--     trừ setup_initial_manager (chỉ chạy trong SQL Editor). Hàm "_..." là hàm nội bộ.
-- =====================================================================

revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;

grant select on
  public.parents,
  public.teachers,
  public.students,
  public.classes,
  public.class_schedules,
  public.class_enrollments,
  public.attendance_records,
  public.profiles,
  public.class_versions,
  public.class_versions_labeled,
  public.month_closures,
  public.audit_log
to authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname !~ '^_'
      and p.proname <> 'setup_initial_manager'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to authenticated', r.fn);
  end loop;
end $$;

insert into public.schema_migrations (version, note)
values ('V3.0', 'Bộ SQL V3 cài mới (supabase/v3)')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
