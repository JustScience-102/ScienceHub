# Quy tắc dự án: Web App Quản lý Trung tâm ScienceHub

> ĐỌC FILE NÀY CÙNG `ARCHITECTURE.md` VÀ `ROADMAP.md` Ở ĐẦU MỖI PHIÊN CHAT.

## 1. Công nghệ & Kiến trúc
- **Nền tảng:** Web App Responsive (hiển thị dạng Bảng trên máy tính `hidden md:block`, dạng Thẻ trên điện thoại `md:hidden`; nút cao tối thiểu 40-44px; Modal trượt từ đáy trên mobile).
- **Stack kỹ thuật:** React (Vite) + Tailwind CSS (`@tailwindcss/vite`) + `@supabase/supabase-js` + `lucide-react`.
- **Điều hướng:** Không dùng thư viện router ngoài; điều hướng bằng state tại `App.jsx` và state con trong từng trang.
- **Hạ tầng:** Frontend triển khai trên Vercel, kết nối trực tiếp tới Supabase (Database, Auth, RLS & RPC).
- **Phong cách UI:** Đơn giản, rõ ràng, tông màu dịu mát (xanh dương nhạt / trắng / xám sáng) lấy cảm hứng từ Azota.

## 2. Quy ước chung (Conventions)
- **Ngôn ngữ hiển thị (UI) & Thông báo lỗi DB:** 100% Tiếng Việt rõ ràng, lịch sự, xưng **"Trung tâm"**.
- **Định dạng chuẩn:**
  - Tiền tệ: Số nguyên VNĐ có dấu chấm phân cách (`100.000đ`).
  - Ngày tháng hiển thị: `DD/MM/YYYY` (Ví dụ: `27/10/2026`).
  - Múi giờ chuẩn: Luôn tính "hôm nay" và "tháng hiện tại" theo múi giờ `Asia/Ho_Chi_Minh` (ở DB dùng `public.vn_today()` và `public.vn_month_start()`; ở Frontend dùng `todayISO()` trong `src/lib/schedule.js`, tuyệt đối không dùng `toISOString()`).
  - Thứ trong tuần: `2` = Thứ 2 ... `7` = Thứ 7, `8` = Chủ nhật (`day_of_week = getDay() === 0 ? 8 : getDay() + 1`).
  - Sắp xếp học sinh: Luôn sắp xếp theo **TÊN gọi** (từ cuối của họ tên, dùng `compareVietnameseNames`).
- **Quy ước đặt tên Code & Database:** Tên bảng, cột, hàm SQL dùng tiếng Anh `snake_case`. Tham số hàm RPC bắt đầu bằng `p_`.

## 3. Lệnh Cấm (Strict Prohibitions)
1. **Cấm vượt phạm vi:** Tuyệt đối KHÔNG tự thêm chức năng quản lý thu học phí/công nợ, cổng thanh toán, tính lương giáo viên, hay tạo mã QR/gửi tin nhắn Zalo.
2. **Cấm tự ý cài thư viện ngoài:** Chỉ dùng các thư viện đã có trong `package.json`. Muốn thêm thư viện phải hỏi và được duyệt trước.
3. **Cấm sửa file đã khóa khi chưa xin phép:** Mọi file thuộc các lát cắt đã nghiệm thu đều đã khóa (V1, V2-1, V2-2, V2-3, V2-4 và V2-5; danh sách file khóa của V2-2 nằm ở mục V2-2 và của V2-3/V2-4 nằm ở mục V2-4 và V2-5 trong `ROADMAP.md`, gồm cả `supabase/05_v2_2_teacher_access.sql`, `06_v2_3_audit_log.sql`, `07_v2_4_backup.sql`, `08_v2_5_bulk_import.sql`). Nếu lát cắt mới bắt buộc phải chạm vào file đã khóa, phải liệt kê rõ tên file và nội dung sửa trong Kế hoạch Bước 1 để chờ duyệt.
4. **Cấm Xóa trắng (Hard Delete) dữ liệu nghiệp vụ:**
   - Giáo viên, Lớp học, Học sinh, Phụ huynh dùng xóa mềm qua cột `deleted_at`.
   - Nghỉ học dùng xóa mềm trên `class_enrollments` (`status = 'dropped'` kèm `left_at`).
5. **Cấm tính doanh thu/học phí theo giá động:** Mọi tính toán doanh thu và học phí bắt buộc chỉ cộng từ cột `attendance_records.price_snapshot` (đơn giá đã đóng băng lúc điểm danh), không bao giờ nhân với `classes.price_per_session`.
6. **Nguyên tắc Bảo mật & Phân quyền (V2):**
   - Bảo mật thật nằm ở Database (RLS + kiểm tra vai trò ở đầu hàm RPC). Ẩn nút trên giao diện chỉ để tiện dùng.
   - Tuyệt đối KHÔNG đưa khóa `service_role` vào code frontend, `.env` hay biến môi trường `VITE_*`.
   - Khi sửa `src/lib/errors.js`: chỉ thêm nhánh mới đặt TRƯỚC nhánh cũ, không làm thay đổi kết quả các mẫu lỗi cũ.
   - Luôn nhắc người dùng: KHÔNG nhập dữ liệu học sinh/phụ huynh thật và KHÔNG triển khai công khai lên Vercel cho tới khi chạy xong và nghiệm thu file khóa quyền (`04_lockdown_rls.sql`) và phân quyền Giáo viên (`05_v2_2_teacher_access.sql`). Các file này đã nghiệm thu; việc còn lại trước khi nhập dữ liệu thật là hoàn tất các bước ở mục "Triển khai Vercel" trong `ROADMAP.md`.
   - Giáo viên chỉ có quyền `SELECT` qua RLS; mọi thao tác ghi của Giáo viên đi qua RPC `SECURITY DEFINER` (không thêm policy INSERT/UPDATE/DELETE cho Giáo viên). Giáo viên không được đổi tên phụ huynh.

## 3b. Quy ước SQL (`supabase/`)
- Bộ SQL hiện hành: `01_schema.sql` -> `02_triggers.sql` -> `03_rpc_and_auth.sql` -> `04_lockdown_rls.sql` -> `05_v2_2_teacher_access.sql` -> `06_v2_3_audit_log.sql` -> `07_v2_4_backup.sql` -> `08_v2_5_bulk_import.sql` (+ `mock_data.sql`, `check_before_launch.sql`, `reset_mock_data.sql` tùy chọn). Không tạo lại các file `sliceN_migration.sql` cũ. Không chạy lại `03` sau `05` (sẽ ghi đè các hàm đã nâng cấp).
- Thay đổi mới là migration đánh số tiếp (`09_...`, `10_...`), viết an toàn khi chạy lại nhiều lần (`create or replace`, `if not exists`, `drop ... if exists`).
- Bảng `audit_log` là bảng duy nhất được xóa dòng, và chỉ qua `clear_audit_logs_before` (đã sao lưu, khớp số dòng, có cụm xác nhận). Mọi dữ liệu nghiệp vụ khác vẫn cấm hard delete (mục 3.4); riêng `reset_mock_data.sql` chỉ dùng một lần để dọn dữ liệu thử trước khi vận hành thật. Trigger nhật ký mới trên bảng nghiệp vụ phải dùng `_write_audit_log` và không được tính lại giá theo `classes.price_per_session`.
- Hàm RPC chỉ Quản lý gọi: đặt `perform public.assert_manager();` ở dòng đầu. Hàm RPC mở cho Giáo viên (từ V2-2) bắt buộc `SECURITY DEFINER` + `set search_path = public` và tự kiểm tra vai trò/phạm vi lớp/tháng hiện tại bên trong hàm. Hàm nội bộ (tiền tố `_`) phải thu quyền EXECUTE của `anon`, `authenticated`, `public`.
- Thông báo `RAISE EXCEPTION` bằng tiếng Việt, xưng "Trung tâm".
- `mock_data.sql` phải tuân thủ cấu trúc hiện hành (tên lớp `Môn_Khối_TênGV_STT`, lịch ở `class_schedules`, học sinh chỉ học lớp cùng khối, ghi danh `dropped` tạo bằng INSERT `active` rồi UPDATE).

## 4. Quy trình làm việc 3 bước (Workflow)
- **Bước 1 - Lên kế hoạch:** Với mỗi yêu cầu hoặc lát cắt, chỉ nêu kế hoạch ngắn gọn dạng gạch đầu dòng (tạo/sửa file nào, giải quyết logic gì). Chờ người dùng duyệt mới viết code.
- **Bước 2 - Không tự suy diễn:** Nếu có điểm nghiệp vụ hay trường hợp biên chưa rõ, phải hỏi lại kèm phương án đề xuất trước khi làm.
- **Bước 3 - Bàn giao & Hướng dẫn nghiệm thu:** Sau khi viết code xong, chạy `npm run lint` và `npm run build` để đảm bảo sạch lỗi, sau đó cung cấp kịch bản nghiệm thu ngắn gọn (chạy SQL nào, bấm vào đâu, thấy kết quả gì trên màn hình).