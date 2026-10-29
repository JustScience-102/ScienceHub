# ScienceHub

Web app quản lý Trung tâm ScienceHub: lớp học, học sinh, phụ huynh, giáo viên, điểm danh và học phí theo tháng.

Stack: React (Vite) + Tailwind CSS + Supabase (PostgreSQL, Auth, RLS, RPC).

## Tài liệu dự án
- `RULES.md`: quy tắc, quy ước và quy trình làm việc.
- `ARCHITECTURE.md`: cấu trúc Database, nghiệp vụ và giao diện hiện hành.
- `ROADMAP.md`: tiến độ và kế hoạch các lát cắt tiếp theo.

## Cài đặt
1. `npm install`
2. Sao chép `.env.example` thành `.env` và điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Không đưa khóa `service_role` vào frontend.
3. Trong Supabase SQL Editor, chạy lần lượt `supabase/01_schema.sql`, `02_triggers.sql`, `03_rpc_and_auth.sql`.
4. Tạo user Quản lý trong Supabase Authentication, rồi chạy `select public.setup_initial_manager('email_cua_ban');`.
5. (Tùy chọn) Chạy `supabase/mock_data.sql` trên Database trống để có dữ liệu thử.
6. Đăng nhập thử trên web, sau đó chạy `supabase/04_lockdown_rls.sql` để khóa quyền.
7. Chạy `supabase/05_v2_2_teacher_access.sql` để mở tài khoản và phân quyền cho Giáo viên (không chạy lại file 03 sau file này).
8. Chạy `supabase/06_v2_3_audit_log.sql` (Nhật ký thay đổi, chỉ Quản lý đọc) rồi `supabase/07_v2_4_backup.sql` (xuất dữ liệu sao lưu JSON/CSV).
9. Chạy `supabase/08_v2_5_bulk_import.sql` (nhập học sinh hàng loạt từ file CSV, chỉ Quản lý).
10. Chạy `supabase/09_v2_6_year_rollover.sql` (chuyển năm học và lịch sử nhãn lớp, chỉ Quản lý; không chạy lại file 02 sau file này).
11. Chạy `supabase/10_v2_7_restore_backup.sql` (khôi phục dữ liệu từ file sao lưu `.json`, chỉ Quản lý; không chạy lại file 09 sau file này).
12. Trước khi nhập dữ liệu thật: chạy `supabase/check_before_launch.sql` để kiểm tra an toàn; nếu đã dùng dữ liệu thử, tải một bản sao lưu rồi dùng `supabase/reset_mock_data.sql` (đọc kỹ chú thích đầu file).

## Triển khai (Vercel)
- Bản đang chạy: https://science-hub-iota.vercel.app. Repo đã có `vercel.json` (SPA routing + Security Headers). Cấu hình biến môi trường `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trên Vercel; tuyệt đối không dùng khóa `service_role`.
- Chỉ triển khai công khai sau khi đã nghiệm thu file `04`, `05`, `06`, `07`. Trong Supabase Authentication: tắt đăng ký tự do, đặt Site URL và Redirect URL theo tên miền Vercel.

## Lệnh
- `npm run dev`: chạy môi trường phát triển.
- `npm run lint`: kiểm tra mã bằng Oxlint.
- `npm run build`: build bản production.
