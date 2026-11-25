# Tiến độ & Kế hoạch (Roadmap)

> **Câu nhắc mở đầu cho phiên chat mới:**
> "Hãy đọc kỹ `RULES.md`, `ARCHITECTURE.md` và `ROADMAP.md`. Tuân thủ quy trình 3 bước trong `RULES.md`. CHƯA viết code mới khi chưa được duyệt kế hoạch."

---

## 0. Trạng thái hiện tại (24/11/2026)
- **Đang chạy:** https://science-hub-iota.vercel.app, mã nhánh `main`, Database V3 trên project Supabase `ScienceHub`. Dữ liệu V2 đã chuyển sang (lần cuối 04/11/2026); project Supabase cũ đã xóa.
- **Kiểm thử:** `npm test` đạt 19 tình huống JS + 113 tình huống Database; lint 0 cảnh báo; build app và `build:site` sạch.
- **SQL trên Supabase khớp mã trong kho:** người dùng đã chạy lại `08_ops.sql` và `09_grants.sql` sau đợt dọn mã 24/11/2026 (khôi phục chỉ nhận file sao lưu V3).
- **Đang làm: trang giới thiệu sciencehub.id.vn (`site/`, `ARCHITECTURE.md` mục 5).** Tên miền mua 24/11/2026 (hết hạn 24/11/2028). Các mốc:
  - **M0 – Tên miền: DNS xong 24/11/2026** (nhà đăng ký dùng DNS `zonedns.vn`; A `@` → `216.198.79.1`; CNAME `www`, `quanly`, `baitap` → giá trị riêng `…vercel-dns-017.com` Vercel cấp). Cả 4 địa chỉ chạy HTTPS; tab Tra cứu điểm chạy trên bản thật. `sciencehub.id.vn` là địa chỉ chính, `www` chuyển về (25/11/2026). Còn lại (người dùng làm tay): thêm `https://quanly.sciencehub.id.vn/**` vào Redirect URL của Supabase Authentication (Site URL đổi sang tên miền mới khi đã chạy).
  - **M1 – Khung web: xong 24/11/2026; nội dung xong 25/11/2026** (địa chỉ, bản đồ, giờ làm việc, lời giới thiệu, nội quy, xin nghỉ, bảng và quy định học phí của Trung tâm Chìa Khóa Vàng; đổi danh xưng thành "Lớp học ScienceHub", `ARCHITECTURE.md` mục 5.1). Chờ người dùng duyệt câu chữ.
  - **M2 – Lịch học các lớp tự động: xong và chạy thật 25/11/2026** (`11_website.sql`, `website.catalog()`, `site/api/lop-hoc.js` chạy ở vùng `sin1` gần CSDL, `ClassSchedule.jsx`; học phí không lấy từ app mà theo `site/src/data/fees.js`). Người dùng đã chạy `website_link.sql` (bản điền mật khẩu ở `%LOCALAPPDATA%\ScienceHub\website-link\`), `11_website.sql`, `09_grants.sql` và đặt `WEBSITE_DATABASE_URL` trên Vercel. Lúc bật: 20 lớp (Vật Lí 10/11/12, Hóa học 10/11/12); Vật Lí 11 có 4 lớp 1 buổi/tuần nhưng chưa xếp nhóm lớp.
  - **M3 – Form đăng ký** (chọn lịch theo nhóm lớp: mỗi phần đúng một ca) + màn hình "Đơn đăng ký" cho Quản lý.
  - **M4 – Hoàn thiện:** ảnh xem trước khi chia sẻ Zalo/Facebook, khai báo Google; bên ScienceApp: `/phu-huynh` chuyển sang `sciencehub.id.vn/tra-cuu-diem`, thẻ "Trang tra cứu điểm cho phụ huynh" đổi liên kết + mã QR.
  - Lưu ý chi phí: gói Hobby của Vercel chỉ cho dùng phi thương mại; nên gom các dự án vào một nhóm Vercel Pro.
- **Tồn đọng nhỏ (không chặn):**
  - Chưa có chức năng gỡ liên kết tài khoản giáo viên (muốn đổi thì liên kết lại bằng email mới; tài khoản cũ mất quyền).
  - `setup_initial_manager` chỉ chạy trong SQL Editor (muốn nhiều Quản lý thì làm hàm riêng).
  - Chưa đo thời gian khôi phục với dữ liệu lớn so với giới hạn thời gian chờ của Supabase; email "Quên mật khẩu" dùng SMTP mặc định (giới hạn số thư mỗi giờ).
  - Khuôn tải dữ liệu `let cancelled = false` lặp ở khoảng 30 component. Chưa có hook chung; nếu tính năng mới cần nhiều chỗ tải dữ liệu thì cân nhắc tạo hook và dùng dần ở những file đang sửa, không viết lại hàng loạt.

---

## 1. Thay đổi gần đây

### 25/11/2026 — Trang giới thiệu: mốc M2 (lịch học tự động); đổi tên app quản lý
- Bảng học phí trên web chỉ còn lớp Vật Lí, Hóa học; ghi rõ "SĐT/Zalo quản lý Trung tâm: 0973 765 752".
- App quản lý hiện tên "Lớp học ScienceHub" (tiêu đề trình duyệt, thanh bên, thanh tiêu đề điện thoại, trang Đăng nhập). Mã nhận diện file sao lưu `'Trung tâm ScienceHub'` (`08_ops.sql`, `lib/restore.js`) **giữ nguyên** để file sao lưu cũ vẫn khôi phục được.
- `supabase/v3/11_website.sql` + `website_link.sql` (mẫu), test `v3_website.test.mjs` (7 tình huống); `site/api/lop-hoc.js`, `site/src/lib/catalog.js`, `ClassSchedule.jsx`; thư viện `postgres` 3.4.9 cho `site/`.
- Trang Lớp học & học phí: học phí đặt trước lịch học; nhóm lớp hiện từng phần trong khung riêng nối bằng "+", kèm ví dụ cách chọn lịch đúng/sai tính từ lịch thật (`partCombos`).
- Sửa lỗi `/api/lop-hoc` báo "Chưa tải được lịch học" ở lần gọi đầu mỗi khi Vercel khởi động hàm: `db.array()` của thư viện `postgres` trên kết nối mới gửi sai định dạng mảng (22P02). Nay gửi chuỗi "Vật Lí|Hóa học" và tách bằng `string_to_array`; lỗi thì thử lại một lần bằng kết nối mới. **Hàm máy chủ mới của `site/` không truyền mảng bằng `db.array()`.**

### 25/11/2026 — Trang giới thiệu: nội dung thật
- Danh xưng "Lớp học ScienceHub"; ScienceHub cộng tác với Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy (Trung tâm quy định và thu học phí). Bảng và quy định học phí chép từ tờ quy định của Trung tâm (`site/src/data/fees.js`); trang Quy định viết lại (nội quy "Tôn sư trọng đạo · Tiên học lễ, hậu học văn", xin nghỉ báo trước cho thầy, học bù); lời giới thiệu và lưu ý "không phù hợp với học sinh quá lười" ở trang chủ và trang Đăng ký; Chính sách bảo mật ghi rõ thông tin chuyển cho Trung tâm để thu học phí.
- Tên miền: `sciencehub.id.vn` là địa chỉ chính, `www` chuyển về.

### 24/11/2026 — Trang giới thiệu sciencehub.id.vn: mốc M1
- Người dùng chốt: lịch và học phí lấy từ app trung tâm, có tên giáo viên; form chọn lịch theo nhóm lớp (mỗi phần đúng một ca); tra cứu điểm là một tab của web; đơn đăng ký chỉ Quản lý xem, không vào file sao lưu; duyệt thư viện `astro`, `@astrojs/react`, `postgres` cho `site/`; tên miền con `quanly.`, `baitap.`.
- Thư mục `site/` (Astro 7 + React + Tailwind): trang chủ, Lớp học & học phí, Quy định, Đăng ký học (hai trang này tạm ghi "đang cập nhật"), Tra cứu điểm (giao diện mới, API của ScienceApp qua `/api/diem/*`), Chính sách bảo mật, 404. CSP chế độ chặn có mã băm.
- App trung tâm: logo "chữ S và quỹ đạo" thay biểu tượng sách (`components/BrandLogo.jsx`: thanh bên, thanh tiêu đề điện thoại, trang Đăng nhập) và thay favicon mặc định của Vite.
- `npm run build:site`; test JS thêm phần tra cứu điểm (`site/src/lib/parentLookup.js`).

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
