# ScienceHub

Web app quản lý Trung tâm ScienceHub: lớp học, học sinh, phụ huynh, giáo viên, điểm danh và học phí theo tháng.

Stack: React (Vite) + Tailwind CSS + Supabase (PostgreSQL, Auth, RLS, RPC).

## Tài liệu dự án
- `RULES.md`: quy tắc, quy ước và quy trình làm việc.
- `ARCHITECTURE.md`: cấu trúc Database, nghiệp vụ và giao diện (đang mô tả V2; thay đổi của V3 xem mục 0 của `ROADMAP.md` và chú thích đầu mỗi file `supabase/v3/*.sql`).
- `ROADMAP.md`: tiến độ và kế hoạch.

## Cài đặt
1. `npm install`
2. Sao chép `.env.example` thành `.env` và điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Không đưa khóa `service_role` vào frontend.
3. Trên một project Supabase mới (trống), trong SQL Editor chạy lần lượt `supabase/v3/00_meta.sql` -> `09_grants.sql`. Bộ này chạy lại nhiều lần vẫn an toàn; sau mỗi lần sửa SQL phải chạy lại `09_grants.sql`.
4. Supabase Authentication > Users: tạo user Quản lý (bật Auto Confirm), sửa email trong `supabase/v3/bootstrap_manager.sql` rồi chạy file đó.
5. Chạy `supabase/v3/check_v3.sql` và đối chiếu kết quả mong đợi ghi trong từng truy vấn.
6. (Tùy chọn) Chuyển dữ liệu từ hệ thống cũ: đăng nhập Quản lý, vào Tổng quan -> Sao lưu & Năm học -> Khôi phục từ file sao lưu, chọn file `.json` đã xuất từ hệ thống cũ, xem trước rồi gõ `KHOI PHUC`.
7. Tài khoản Giáo viên: tạo user trong Authentication rồi liên kết ở trang Giáo viên -> Hồ sơ -> Liên kết tài khoản đăng nhập.

## Triển khai (Vercel)
- Bản đang chạy: https://science-hub-iota.vercel.app. Repo đã có `vercel.json` (SPA routing + Security Headers + CSP). Cấu hình biến môi trường `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trên Vercel; tuyệt đối không dùng khóa `service_role`.
- Chỉ triển khai công khai sau khi `check_v3.sql` đạt và đã thử đăng nhập Quản lý, Giáo viên. Trong Supabase Authentication: tắt đăng ký tự do, đặt Site URL và Redirect URL theo tên miền Vercel.

## Lệnh
- `npm run dev`: chạy môi trường phát triển.
- `npm run lint`: kiểm tra mã bằng Oxlint.
- `npm run build`: build bản production.
- `npm test`: kiểm thử hàm JS thuần (`test:js`) và toàn bộ bộ SQL V3 trên PGlite (`test:db`, không cần Supabase). `npm run test:db <từ khóa>` chạy riêng các file test có tên chứa từ khóa.
