# Tiến độ & Kế hoạch (Roadmap)

> **Câu nhắc mở đầu cho phiên chat mới:**
> "Hãy đọc kỹ `RULES.md`, `ARCHITECTURE.md` và `ROADMAP.md`. Tuân thủ quy trình 3 bước trong `RULES.md`. CHƯA viết code mới khi chưa được duyệt kế hoạch."

---

## 0. Trạng thái hiện tại (24/11/2026)
- **Đang chạy:** https://science-hub-iota.vercel.app, mã nhánh `main`, Database V3 trên project Supabase `ScienceHub`. Dữ liệu V2 đã chuyển sang (lần cuối 04/11/2026); project Supabase cũ đã xóa.
- **Kiểm thử:** `npm test` đạt 13 tình huống JS + 106 tình huống Database; lint 0 cảnh báo; build sạch.
- **Người dùng cần làm sau đợt dọn mã 24/11/2026:** trong SQL Editor của project `ScienceHub`, chạy lại `supabase/v3/08_ops.sql` rồi `09_grants.sql` (khôi phục chỉ còn nhận file sao lưu V3).
- **Tồn đọng nhỏ (không chặn):**
  - Chưa có chức năng gỡ liên kết tài khoản giáo viên (muốn đổi thì liên kết lại bằng email mới; tài khoản cũ mất quyền).
  - `setup_initial_manager` chỉ chạy trong SQL Editor (muốn nhiều Quản lý thì làm hàm riêng).
  - Chưa đo thời gian khôi phục với dữ liệu lớn so với giới hạn thời gian chờ của Supabase; email "Quên mật khẩu" dùng SMTP mặc định (giới hạn số thư mỗi giờ).
  - Khuôn tải dữ liệu `let cancelled = false` lặp ở khoảng 30 component. Chưa có hook chung; nếu tính năng mới cần nhiều chỗ tải dữ liệu thì cân nhắc tạo hook và dùng dần ở những file đang sửa, không viết lại hàng loạt.

---

## 1. Thay đổi gần đây

### 24/11/2026 — Dọn mã trước khi thêm tính năng mới
- Bỏ nhánh `v3`: mọi thay đổi commit và push thẳng lên `main`.
- Xóa phần V2 còn sót (`supabase/legacy/`, test chuyển dữ liệu V2): khôi phục chỉ nhận file V3 và báo rõ khi chọn file V2. Test khôi phục thuần V3: `v3_restore.test.mjs`.
- Giao diện: component dùng chung `FormActions`, `SearchInput`, `lib/buttonStyles.js`; bỏ các nhánh "chưa kết nối Supabase" không bao giờ chạy trong các trang.
- Sửa: CSV "Lớp học & Lịch học" từng gộp lịch của mọi thời kỳ (nay chỉ lịch đang áp dụng, giống trang Lớp học); màu môn Văn, Anh, Khoa học tự nhiên không khớp tên môn.
- Viết lại `ARCHITECTURE.md`, `RULES.md` theo V3; bỏ cơ chế "file khóa theo lát cắt" (thay bằng: test, lint, build phải đạt trước khi push; đổi quy tắc nghiệp vụ đã chốt phải được duyệt).

### 17–21/11/2026 — Nối app giao bài tập ScienceApp
- App giao bài lấy học sinh, lớp, ghi danh từ Trung tâm (mã HS làm tên đăng nhập; từ 21/11 có SĐT phụ huynh làm mật khẩu ban đầu) và gửi điểm về. Điểm chỉ hiện ở hồ sơ học sinh, tab "Lịch sử làm bài tập"; không làm bảng điểm theo lớp (xem ở app giao bài).
- SQL `supabase/v3/10_sciencehub.sql`; frontend `components/students/HomeworkHistory.jsx`, `lib/homework.js`; test `v3_sciencehub.test.mjs`. Chi tiết ở `ARCHITECTURE.md` mục 2.14.

### 12/11/2026 — Nhóm lớp; rà soát mã
- Nhóm lớp (mục 2.7 của `ARCHITECTURE.md`): bảng `class_groups`, `class_group_members`, trigger kiểm lúc COMMIT, RPC `save_class_group`, `delete_class_group`, `class_groups_overview`; `ClassGroupsModal`, `ClassGroupsPanel`; test `v3_class_groups.test.mjs`.
- So trùng họ tên học sinh cùng phụ huynh thống nhất bằng `_norm_name` (không phân biệt hoa thường, phân biệt dấu) cho đăng ký, sửa và nhập CSV. Gộp bộ chuyển tháng thành `MonthNav`.

---

## 2. Lịch sử (tóm tắt)
- **V1 (đến 27/10/2026):** quản lý giáo viên, học sinh, phụ huynh, lớp và lịch học; ghi danh, cho nghỉ, đổi lớp, đăng ký thêm lớp cùng khối; điểm danh đóng băng đơn giá, điểm danh giọng nói, học bù; hồ sơ học sinh (học phí đa môn theo tháng), hồ sơ giáo viên, Tổng quan.
- **V2 (27–29/10/2026, project Supabase cũ):** V2-1 đăng nhập và khóa quyền Quản lý; V2-2 tài khoản Giáo viên, phân quyền theo lớp, phiên 48 giờ; V2-3 nhật ký thay đổi; V2-4 sao lưu thủ công (JSON/CSV); V2-5 nhập học sinh từ CSV; V2-6 chuyển năm học và lịch sử nhãn lớp; V2-7 khôi phục từ file sao lưu. Mã SQL V2 đã xóa khỏi kho ngày 24/11/2026 (còn trong lịch sử git trước commit `0402f25`).
- **Triển khai Vercel (29/10/2026):** biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production + Preview); Supabase Authentication: Site URL và Redirect URL `https://science-hub-iota.vercel.app/**`, tắt đăng ký tự do; CSP ở chế độ chặn.
- **V3 (29/10–04/11/2026, project Supabase mới):** xây lại sạch, chuyển dữ liệu bằng file sao lưu V2. Thay đổi chính:
  - `authenticated` chỉ SELECT, mọi thao tác ghi (kể cả Quản lý) qua RPC; quyền chỉ cấp ở `09_grants.sql`; RLS Giáo viên dạng tập hợp (`my_*_ids`).
  - Tên lớp do Database sinh (`LamA`/`LamB` khi trùng tên gọi cùng môn); lịch học theo thời kỳ ("Áp dụng lịch mới từ ngày"); khóa sổ theo tháng; học bù liên kết buổi gốc, mỗi buổi bù một lần, "Hủy học bù"; `left_reason` (nghỉ hẳn / đổi lớp / hoàn thành cuối cấp).
  - Frontend: `fetchAll` (hết cắt ngầm 1000 dòng), xem trước tên lớp, điểm danh lưu theo hàng đợi, phần "Khóa sổ tháng" trong Sao lưu & Năm học.
  - Bộ test Database trên PGlite (`npm test`).
  - Gộp vào `main` từ 30/10/2026 (PR #2 → #6); dữ liệu V2 chuyển ngày 29/10 và 04/11/2026.
