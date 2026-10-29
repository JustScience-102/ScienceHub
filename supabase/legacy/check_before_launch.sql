-- =====================================================================
-- Trung tâm ScienceHub - DANH SÁCH KIỂM TRA AN TOÀN TRƯỚC KHI NHẬP DỮ LIỆU THẬT / TRIỂN KHAI
-- Chỉ ĐỌC, không sửa gì. Chạy từng truy vấn trong Supabase SQL Editor và đối chiếu kết quả mong đợi.
-- =====================================================================

-- 1. Phải có ít nhất 1 Quản lý đang hoạt động. Mong đợi: >= 1
select count(*) as manager_active
from public.profiles
where role = 'manager' and active = true;

-- 2. Không còn policy mở v1_open_access. Mong đợi: 0 dòng
select tablename, policyname
from pg_policies
where schemaname = 'public' and policyname = 'v1_open_access';

-- 3. Mọi bảng trong schema public đều bật RLS. Mong đợi: 0 dòng
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 4. Số policy SELECT của Giáo viên. Mong đợi: 7
select count(*) as teacher_select_policies
from pg_policies
where schemaname = 'public' and policyname like 'v2_teacher_%';

-- 5. Policy của nhật ký. Mong đợi: đúng 1 dòng v2_manager_select_audit_log, cmd = SELECT
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'audit_log';

-- 6. Số trigger nhật ký và bảo vệ nhật ký. Mong đợi: 11
select count(*) as audit_triggers
from pg_trigger
where tgname like 'trg_audit_%' and not tgisinternal;

-- 7. Hàm trong schema public mà người chưa đăng nhập (anon) vẫn gọi được.
--    Mong đợi: chỉ còn các hàm thời gian vô hại (vn_today, vn_month_start, vn_day_of_week).
--    Nếu thấy hàm nghiệp vụ nào khác, thu quyền: revoke execute on function ... from anon, public;
select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'execute')
order by p.proname;

-- 8. Người chưa đăng nhập (anon) có đọc được dữ liệu nhật ký / hồ sơ không? Mong đợi: false, false
select has_table_privilege('anon', 'public.audit_log', 'select') as anon_read_audit_log,
       has_table_privilege('anon', 'public.profiles',  'select') as anon_read_profiles;

-- 9. Người dùng đã đăng nhập có sửa / xóa trực tiếp được nhật ký không? Mong đợi: false, false, false
select has_table_privilege('authenticated', 'public.audit_log', 'insert') as can_insert,
       has_table_privilege('authenticated', 'public.audit_log', 'update') as can_update,
       has_table_privilege('authenticated', 'public.audit_log', 'delete') as can_delete;

-- 10. Dữ liệu thử còn lại (cần = 0 ở tất cả cột trước khi nhập dữ liệu thật)
select
  (select count(*) from public.students)           as students,
  (select count(*) from public.parents)            as parents,
  (select count(*) from public.classes)            as classes,
  (select count(*) from public.teachers)           as teachers,
  (select count(*) from public.attendance_records) as attendance_records;
