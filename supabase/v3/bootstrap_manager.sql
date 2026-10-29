-- =====================================================================
-- Trung tâm ScienceHub V3 - TẠO TÀI KHOẢN QUẢN LÝ ĐẦU TIÊN
-- Chỉ chạy trong Supabase SQL Editor (API không gọi được hàm này), SAU KHI đã chạy bộ V3 (00 -> 09).
--
-- Các bước:
--   1. Supabase > Authentication > Users > Add user: nhập email + mật khẩu của Quản lý,
--      bật "Auto Confirm User".
--   2. Sửa email ở dòng dưới thành đúng email vừa tạo, rồi chạy file này.
--   3. Chạy check_v3.sql (mục 2 phải ra >= 1), rồi đăng nhập trên web.
-- Muốn thêm Quản lý khác: tạo user mới trong Authentication rồi chạy lại file này với email đó.
-- =====================================================================

select public.setup_initial_manager('email_quan_ly@vi_du.com');

select p.role, p.active, u.email
from public.profiles p join auth.users u on u.id = p.user_id
where p.role = 'manager';
