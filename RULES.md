# Quy tắc dự án: Web App Quản lý Lớp học ScienceHub

> ĐỌC FILE NÀY CÙNG `ARCHITECTURE.md` VÀ `ROADMAP.md` Ở ĐẦU MỖI PHIÊN CHAT.

## 1. Công nghệ & Kiến trúc
- **Nền tảng:** Web App Responsive (bảng trên máy tính `hidden md:block`, thẻ trên điện thoại `md:hidden`; nút cao tối thiểu 40-44px; hộp thoại trượt từ đáy trên điện thoại).
- **Stack:** React (Vite) + Tailwind CSS (`@tailwindcss/vite`) + `@supabase/supabase-js` + `lucide-react`. Kiểm thử Database bằng `@electric-sql/pglite` (chỉ lúc phát triển).
- **Điều hướng:** không dùng thư viện router; điều hướng bằng state ở `App.jsx` và state con trong từng trang.
- **Hạ tầng:** Vercel (frontend) nối thẳng Supabase (Database, Auth, RLS, RPC). Project Supabase `ScienceHub` là Database chính thức; project `ScienceApp` thuộc app giao bài tập (kho khác).
- **Trang giới thiệu (`site/`, sciencehub.id.vn):** Astro 7 + React + Tailwind, dự án Vercel riêng (Root Directory `site`). Thư viện đã duyệt riêng cho `site/` (24/11/2026): `astro`, `@astrojs/react`, `postgres`. Nối CSDL Trung tâm bằng tài khoản CSDL riêng qua hàm máy chủ, **không** mở quyền cho `anon`. Chi tiết: `ARCHITECTURE.md` mục 5.
- **Tên miền:** `sciencehub.id.vn` = trang giới thiệu; `quanly.sciencehub.id.vn` = app này; `baitap.sciencehub.id.vn` = app giao bài ScienceApp.
- **Phong cách UI:** đơn giản, rõ ràng, tông xanh dương nhạt / trắng / xám sáng, lấy cảm hứng từ Azota. Logo "chữ S và quỹ đạo" (`components/BrandLogo.jsx`, ảnh `public/icon-192.png`) dùng chung với app giao bài và trang giới thiệu. Dùng component sẵn có trước khi tự viết: `FormActions` (cặp nút Hủy / nút chính), `SearchInput`, `FormField`, `SelectField`, `Modal`, `ConfirmDialog`, `Notice`, `EmptyState`, `MonthNav`; kiểu nút ở `lib/buttonStyles.js`.

## 2. Quy ước chung
- **Ngôn ngữ hiển thị & thông báo lỗi:** 100% tiếng Việt rõ ràng, lịch sự, xưng **"Trung tâm"**.
- **Định dạng:** tiền là số nguyên VNĐ có dấu chấm (`100.000đ`); ngày hiển thị `DD/MM/YYYY`.
- **Múi giờ:** "hôm nay" và "tháng hiện tại" theo `Asia/Ho_Chi_Minh` (Database: `vn_today()`, `vn_month_start()`; frontend: `todayISO()` trong `src/lib/schedule.js`, tuyệt đối không dùng `toISOString()` cho ngày).
- **Thứ trong tuần:** `2` = Thứ 2 … `7` = Thứ 7, `8` = Chủ nhật.
- **Sắp xếp học sinh:** theo **tên gọi** (từ cuối của họ tên, `compareVietnameseNames`).
- **Đặt tên:** bảng, cột, hàm SQL dùng tiếng Anh `snake_case`; tham số RPC bắt đầu bằng `p_`.
- **Tải danh sách từ Supabase:** dùng `fetchAll` (Supabase cắt ngầm ở 1000 dòng mỗi truy vấn). Lỗi hiển thị qua `toVietnameseError`.

## 3. Lệnh cấm
1. **Không vượt phạm vi:** KHÔNG tự thêm chức năng thu học phí/công nợ, cổng thanh toán, tính lương giáo viên, tạo mã QR/gửi tin nhắn Zalo.
2. **Không tự cài thư viện ngoài:** chỉ dùng thư viện đã có trong `package.json`; muốn thêm phải hỏi và được duyệt.
3. **Không đổi quy tắc nghiệp vụ đã chốt khi chưa được duyệt:** các quy tắc ở mục 2 của `ARCHITECTURE.md` là hành vi đã nghiệm thu. Kế hoạch nào làm thay đổi một quy tắc trong đó phải nêu rõ ở Bước 1 và chờ duyệt.
4. **Không xóa cứng dữ liệu nghiệp vụ:**
   - Giáo viên, lớp, học sinh, phụ huynh dùng `deleted_at` (học sinh, phụ huynh do hệ thống tự ẩn/hiện).
   - Nghỉ học là xóa mềm trên `class_enrollments` (`status = 'dropped'`, `left_at`, `left_reason`).
   - Hai ngoại lệ có kiểm soát duy nhất: `clear_audit_logs_before` (xóa nhật ký cũ đã sao lưu, khớp số dòng, cụm `XOA NHAT KY`) và `restore_center_backup` (thay dữ liệu bằng file sao lưu, xem trước, cụm `KHOI PHUC`).
5. **Không tính doanh thu/học phí theo giá động:** chỉ cộng `attendance_records.price_snapshot`, không bao giờ nhân với `classes.price_per_session`.
6. **Bảo mật:**
   - Bảo mật thật nằm ở Database (RLS + kiểm vai trò trong RPC). Ẩn nút trên giao diện chỉ để tiện dùng.
   - `authenticated` chỉ có SELECT; mọi thao tác ghi, kể cả của Quản lý, đi qua RPC. Không thêm policy INSERT/UPDATE/DELETE và không ghi thẳng bảng từ trình duyệt.
   - KHÔNG đưa khóa `service_role` vào code frontend, `.env` hay biến `VITE_*`.
   - Giáo viên không được đổi tên phụ huynh.
   - Sửa `src/lib/errors.js`: chỉ thêm nhánh mới đặt TRƯỚC nhánh chung, không làm đổi kết quả các mẫu lỗi cũ.

## 3b. Quy ước SQL (`supabase/v3/`)
- Mỗi hàm định nghĩa ở **một** file theo chủ đề (bảng ở `01`, bảo mật `02`, tên lớp `03`, trigger `04`, RPC nghiệp vụ `05`, quản trị `06`, nhật ký `07`, vận hành `08`). Mảng tách biệt thì thêm file đánh số tiếp (như `10_sciencehub.sql`). Mọi file chạy lại an toàn (`create or replace`, `if not exists`, `drop ... if exists`).
- Quyền chỉ cấp ở `09_grants.sql`; sau mỗi lần sửa SQL phải chạy lại file đã sửa rồi `09_grants.sql`.
- RPC: `SECURITY DEFINER` + `set search_path = public`; dòng đầu `perform public.assert_manager();` (chỉ Quản lý) hoặc `public.assert_staff()` (cả Giáo viên), và tự kiểm phạm vi lớp + tháng hiện tại với Giáo viên. Hàm nội bộ đặt tên bắt đầu bằng `_`.
- `RAISE EXCEPTION` bằng tiếng Việt, bắt đầu bằng `Trung tâm: `.
- Đổi môn, khối, STT hoặc giáo viên của lớp luôn qua `UPDATE classes` để trigger lưu nhãn cũ vào `class_versions` (chỉ thêm, cấm sửa/xóa). Hiển thị lịch sử tháng cũ dùng nhãn theo ngày (`class_label_on` / `lib/classVersions.js`). Chuyển khối cả loạt lớp chỉ qua `rollover_school_year`.
- Trigger mới trên bảng nghiệp vụ: bỏ qua khi `public._is_restoring()`; ghi nhật ký bằng `_write_audit_log`; không tính lại giá theo `classes.price_per_session`.
- **Thêm bảng nghiệp vụ mới** thì phải đưa vào sao lưu và khôi phục: các danh sách bảng trong `08_ops.sql` (`export_center_backup`, `restore_stage_chunk`, `_restore_apply`, `restore_center_backup`), `STAGE_ORDER` và `TABLE_LABELS` trong `src/lib/restore.js`, `supabase/tests/lib/restore_helper.mjs`, và test khứ hồi trong `v3_restore.test.mjs`.
- Mọi thay đổi SQL phải có test tương ứng trong `supabase/tests/*.test.mjs` (dựng dữ liệu bằng chính các RPC, xem `lib/v3_helpers.mjs`).

## 4. Quy trình làm việc 3 bước
- **Bước 1 - Lên kế hoạch:** với mỗi yêu cầu, nêu kế hoạch ngắn gọn dạng gạch đầu dòng (tạo/sửa file nào, giải quyết logic gì). Chờ người dùng duyệt mới viết code.
- **Bước 2 - Không tự suy diễn:** điểm nghiệp vụ hay trường hợp biên chưa rõ thì hỏi lại kèm phương án đề xuất trước khi làm.
- **Bước 3 - Kiểm tra, đẩy lên & bàn giao:**
  - Chạy `npm test`, `npm run lint`, `npm run build` (sửa `site/` thì chạy thêm `npm run build:site`). Lint phải **0 cảnh báo**: Oxlint vẫn trả mã thoát 0 khi chỉ có cảnh báo, nên đọc kết quả, không chỉ nhìn mã thoát.
  - Tự làm mọi bước kiểm tra làm được; chỉ liệt kê cho người dùng những việc phải làm tay (chạy SQL trong Supabase SQL Editor, đăng nhập thử trên giao diện thật, cấu hình Supabase/Vercel).
  - Đạt hết thì commit và push lên `main` (mục 5), rồi đưa kịch bản nghiệm thu ngắn gọn (chạy SQL nào, bấm vào đâu, thấy gì trên màn hình).

## 5. Git & triển khai
- Chỉ dùng nhánh `main`; mọi thay đổi commit và push thẳng lên `main` (người dùng cho phép 24/11/2026).
- Mỗi lần push, Vercel triển khai production ngay (https://science-hub-iota.vercel.app; trang giới thiệu `site/` là dự án Vercel thứ hai cùng kho). Chỉ push khi mục 4 Bước 3 đã đạt.
- Thay đổi có SQL: frontend lên production ngay khi push, còn SQL chỉ có hiệu lực khi người dùng chạy trong SQL Editor. Hãy viết SQL và frontend sao cho thứ tự nào cũng không làm hỏng bản đang chạy, hoặc ghi rõ thứ tự trong kịch bản nghiệm thu.
