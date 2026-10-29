-- =====================================================================
-- Trung tâm ScienceHub V3 - KIỂM TRA AN TOÀN (CHỈ ĐỌC, không sửa gì)
-- Chạy trong Supabase SQL Editor sau khi cài bộ V3 và sau mỗi lần cập nhật SQL.
-- Mỗi truy vấn ghi rõ kết quả mong đợi. Bộ test npm run test:db kiểm đúng các điều này trên PGlite.
-- =====================================================================

-- 1. Phiên bản bộ SQL đã cài. Mong đợi: có dòng V3.0
select version, applied_at from public.schema_migrations order by applied_at;

-- 2. Có ít nhất 1 Quản lý đang hoạt động. Mong đợi: >= 1
select count(*) as manager_active from public.profiles where role = 'manager' and active;

-- 3. Bảng chưa bật RLS. Mong đợi: 0 dòng
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 4. Policy không phải SELECT (V3 không có policy ghi nào). Mong đợi: 0 dòng
select tablename, policyname, cmd from pg_policies where schemaname = 'public' and cmd <> 'SELECT';

-- 5. Quyền ghi trực tiếp vào bảng của anon/authenticated, hoặc anon đọc được bảng. Mong đợi: 0 dòng
select c.relname, r.role, p.priv
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) r(role)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
where n.nspname = 'public' and c.relkind in ('r', 'v')
  and has_table_privilege(r.role, c.oid, p.priv)
  and not (r.role = 'authenticated' and p.priv = 'SELECT');

-- 6. Hàm anon gọi được. Mong đợi: 0 dòng
select p.oid::regprocedure as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

-- 7. Hàm nội bộ (tên bắt đầu bằng "_") hoặc setup_initial_manager mà authenticated gọi được. Mong đợi: 0 dòng
select p.oid::regprocedure as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname ~ '^_' or p.proname = 'setup_initial_manager')
  and has_function_privilege('authenticated', p.oid, 'execute');

-- 8. Hàm SECURITY DEFINER thiếu search_path cố định. Mong đợi: 0 dòng
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- 9. Lớp đang hiển thị trùng tên. Mong đợi: 0 dòng
select lower(name) as name, count(*) from public.classes where deleted_at is null group by 1 having count(*) > 1;

-- 10. Học sinh đang học các lớp khác khối. Mong đợi: 0 dòng
select s.student_code, s.full_name
from public.students s
join public.class_enrollments e on e.student_id = s.id and e.status = 'active'
join public.classes c on c.id = e.class_id
group by s.id, s.student_code, s.full_name
having count(distinct c.grade) > 1;

-- 11. Số liệu hiện có (đối chiếu với hệ thống cũ sau khi chuyển dữ liệu)
select
  (select count(*) from public.teachers)           as teachers,
  (select count(*) from public.parents)            as parents,
  (select count(*) from public.students)           as students,
  (select count(*) from public.classes)            as classes,
  (select count(*) from public.class_enrollments)  as enrollments,
  (select count(*) from public.attendance_records) as attendance_records,
  (select count(*) from public.month_closures)     as closed_months;
