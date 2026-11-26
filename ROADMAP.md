# Tiến độ & Kế hoạch (Roadmap)

> **Câu nhắc mở đầu cho phiên chat mới:**
> "Hãy đọc kỹ `RULES.md`, `ARCHITECTURE.md` và `ROADMAP.md`. Tuân thủ quy trình 3 bước trong `RULES.md`. CHƯA viết code mới khi chưa được duyệt kế hoạch."

---

## 0. Trạng thái hiện tại (24/11/2026)
- **Đang chạy:** https://science-hub-iota.vercel.app, mã nhánh `main`, Database V3 trên project Supabase `ScienceHub`. Dữ liệu V2 đã chuyển sang (lần cuối 04/11/2026); project Supabase cũ đã xóa.
- **Kiểm thử:** `npm test` đạt 27 tình huống JS + 126 tình huống Database; lint 0 cảnh báo; build app và `build:site` sạch.
- **SQL trên Supabase khớp mã trong kho:** người dùng đã chạy lại `08_ops.sql` và `09_grants.sql` sau đợt dọn mã 24/11/2026 (khôi phục chỉ nhận file sao lưu V3).
- **Đang làm: trang giới thiệu sciencehub.id.vn (`site/`, `ARCHITECTURE.md` mục 5).** Tên miền mua 24/11/2026 (hết hạn 24/11/2028). Các mốc:
  - **M0 – Tên miền: DNS xong 24/11/2026** (nhà đăng ký dùng DNS `zonedns.vn`; A `@` → `216.198.79.1`; CNAME `www`, `quanly`, `baitap` → giá trị riêng `…vercel-dns-017.com` Vercel cấp). Cả 4 địa chỉ chạy HTTPS; tab Tra cứu điểm chạy trên bản thật. `sciencehub.id.vn` là địa chỉ chính, `www` chuyển về (25/11/2026). Còn lại (người dùng làm tay): thêm `https://quanly.sciencehub.id.vn/**` vào Redirect URL của Supabase Authentication (Site URL đổi sang tên miền mới khi đã chạy).
  - **M1 – Khung web: xong 24/11/2026; nội dung xong 25/11/2026** (địa chỉ, bản đồ, giờ làm việc, lời giới thiệu, nội quy, xin nghỉ, bảng và quy định học phí của Trung tâm Chìa Khóa Vàng; đổi danh xưng thành "Lớp học ScienceHub", `ARCHITECTURE.md` mục 5.1). Chờ người dùng duyệt câu chữ.
  - **M2 – Lịch học các lớp tự động: xong và chạy thật 25/11/2026** (`11_website.sql`, `website.catalog()`, `site/api/lop-hoc.js` chạy ở vùng `sin1` gần CSDL, `ClassSchedule.jsx`; học phí không lấy từ app mà theo `site/src/data/fees.js`). Người dùng đã chạy `website_link.sql` (bản điền mật khẩu ở `%LOCALAPPDATA%\ScienceHub\website-link\`), `11_website.sql`, `09_grants.sql` và đặt `WEBSITE_DATABASE_URL` trên Vercel. Lúc bật: 20 lớp (Vật Lí 10/11/12, Hóa học 10/11/12); Vật Lí 11 có 4 lớp 1 buổi/tuần nhưng chưa xếp nhóm lớp.
  - **M3 – Form đăng ký + màn hình "Đơn đăng ký": mã xong 25/11/2026** (`ARCHITECTURE.md` mục 5.1, 5.2). Người dùng làm tay: chạy lại `11_website.sql` rồi `09_grants.sql` (không cần đổi gì trên Vercel); gửi thử một đơn trên web rồi xem ở app quản lý.
  - **Trang chủ mới: xong 25/11/2026** (`site/README.md` mục "Trang chủ"). Người dùng làm tay: thay ảnh giữ chỗ trong `site/src/assets/anh/` (4 ảnh lớp học, 1 ảnh chụp màn hình app); điền con số và nhận xét THẬT vào `site/src/data/trang-chu.js` (đang để trống nên phần đó đang ẩn); duyệt 20 câu hỏi "vì sao" ở `site/src/data/cau-hoi-vi-sao.js`.
  - **Web một trang cuộn: xong 26/11/2026** (`site/README.md`, `ARCHITECTURE.md` mục 5.1). Người dùng xem thử trên
    điện thoại thật: cuộn qua các phần, bấm thanh đáy, bấm "Đăng ký lịch này"; thấy bất cập thì báo để chỉnh.
  - **M4 – Hoàn thiện:** ảnh xem trước khi chia sẻ Zalo/Facebook, khai báo Google; bên ScienceApp: `/phu-huynh` chuyển sang `sciencehub.id.vn/tra-cuu-diem` (tự chuyển về phần Tra cứu điểm của trang chủ), thẻ "Trang tra cứu điểm cho phụ huynh" đổi liên kết + mã QR.
  - Lưu ý chi phí: gói Hobby của Vercel chỉ cho dùng phi thương mại; nên gom các dự án vào một nhóm Vercel Pro.
- **Tồn đọng nhỏ (không chặn):**
  - Chưa có chức năng gỡ liên kết tài khoản giáo viên (muốn đổi thì liên kết lại bằng email mới; tài khoản cũ mất quyền).
  - `setup_initial_manager` chỉ chạy trong SQL Editor (muốn nhiều Quản lý thì làm hàm riêng).
  - Chưa đo thời gian khôi phục với dữ liệu lớn so với giới hạn thời gian chờ của Supabase; email "Quên mật khẩu" dùng SMTP mặc định (giới hạn số thư mỗi giờ).
  - Khuôn tải dữ liệu `let cancelled = false` lặp ở khoảng 30 component. Chưa có hook chung; nếu tính năng mới cần nhiều chỗ tải dữ liệu thì cân nhắc tạo hook và dùng dần ở những file đang sửa, không viết lại hàng loạt.

---

## 1. Thay đổi gần đây

### 26/11/2026 — Trang giới thiệu: gộp thành một trang cuộn, thanh tab sáng theo phần đang xem
- Người dùng chốt: cả web là một trang cuộn, lần lượt Trang chủ → Lớp học & học phí → Quy định → Đăng ký học → Tra cứu
  điểm; thanh tab đáy (điện thoại) và thanh ngang (máy tính) sáng mục của phần đang xem, bấm mục là cuộn mượt tới.
  Chính sách bảo mật, 404 vẫn là trang riêng.
- `site/src/scripts/scroll-spy.js` (JS thuần): sáng mục theo vị trí cuộn, bấm mục thì sáng ngay và không nhấp nháy qua
  phần giữa, giữ đúng chỗ khi lịch học/form tải xong làm trang dài thêm (cả khi mở thẳng `/#dang-ky`). Các phần ở
  `site/src/components/parts/` (`Part`, `Classes`, `Rules`, `Register`, `Scores`), phần đầu mỗi phần `PartHeader`
  (cùng kiểu `PageHero`, họa tiết tách ra `HeroPattern`); `PageSection`/`SectionHeader` thêm `level` (h2/h3).
- Bỏ phần trùng: "Các lớp đang mở" (`SchedulePreview`, cùng `sectionDays`/`daysText` và test của chúng) và
  `CallToAction` ở trang chủ; `FitCompact`, `JumpLinks`; quy định thu học phí gộp vào dải Học phí (`FeeInfo` có tiêu đề
  "Quy định thu học phí"), Quy định còn 3 mục.
- Nút "Đăng ký lịch này" cuộn xuống form và chọn sẵn môn + khối không tải lại trang (`site/src/lib/registerPick.js`):
  cùng khối thì thêm môn, khác khối thì đổi khối, đã gửi đơn thì mở form mới. Lịch học và form dùng chung một lần tải
  `/api/lop-hoc` (`loadCatalog`). Form, khung tra cứu điểm dựng khi cuộn gần tới (`client:visible`). Gửi đơn xong cuộn
  về khung "Đã gửi" thay vì đầu trang. Tiêu đề trong form, khung tra cứu điểm hạ cấp (trang chỉ còn một h1).
- Địa chỉ cũ `/lop-hoc`, `/quy-dinh`, `/dang-ky`, `/tra-cuu-diem` thành trang chuyển về `/#phần` (`SectionRedirect`,
  giữ mục con và `?mon=&khoi=`, `noindex`); `/phu-huynh` vẫn qua `vercel.json`. Nút Zalo/Gọi nổi ẩn ở phần Đăng ký, Tra
  cứu điểm (`data-hide-floating`).
- Kiểm tra trên Chrome headless (dữ liệu lịch giả lập, lịch tải chậm): 47 ý, chạy lặp 6 lần đều đạt (sáng đúng mục khi
  cuộn tay, khi bấm và khi chạm giữa chừng, dừng đúng chỗ, Quay lại, địa chỉ cũ, chọn sẵn môn/khối, gửi đơn, giảm chuyển
  động, máy tính 1280px), console không lỗi CSP.

### 26/11/2026 — Trang giới thiệu: các tab khác cùng kiểu trang chủ, tối ưu điện thoại
- Khối dùng chung ở `site/src/components/`: `PageHero` (phần đầu trang), `JumpLinks` (mục lục nhanh cuộn ngang),
  `PageSection` + `SectionHeader` (chuyển từ `home/`), `FloatingContact` (dùng ở trang chủ, Lớp học, Quy định),
  `FitCompact`. Hiện dần khi cuộn và nút nổi tách sang `site/src/scripts/page-effects.js`, nạp ở `Base.astro`. Bỏ
  `PageHeading.astro`, `FitNote.astro`, `CENTER.fitNote`.
- Lớp học & học phí: thẻ giá to; thanh lọc môn/khối dính dưới thanh tiêu đề, một hàng cuộn ngang, nút môn mang màu môn;
  đổi bộ lọc thì đưa đầu danh sách về dưới thanh lọc. Quy định: mỗi mục một dải có biểu tượng, câu "Tôn sư trọng đạo"
  nổi bật, nút nhắn Zalo báo nghỉ, quy định học phí thành danh sách gọn (bỏ thẻ lồng thẻ). Đăng ký học: khung gọn "phù
  hợp với ai?" thay khung vàng. Tra cứu điểm: nền giấy kẻ ô + dòng hỗ trợ. Chân trang: liên kết 2 cột trên điện thoại.
- `RegistrationForm.jsx`, `ScoreLookup.jsx` và các API không đổi.

### 25/11/2026 — Trang giới thiệu: làm mới trang chủ
- Trang chủ chia thành các dải nền xen kẽ (trắng / xanh rất nhạt / giấy kẻ ô), mỗi phần một component ở `site/src/components/home/`: phần đầu có họa tiết khoa học SVG trôi chậm; khung "Câu hỏi vì sao hôm nay" (20 câu, ngẫu nhiên, "Xem lời giải", "Câu khác"); công nghệ (3 ô + khung điện thoại); "Các lớp đang mở" lấy từ `/api/lop-hoc` (thay 4 thẻ lặp menu); ảnh lớp học; con số + nhận xét (tự ẩn khi chưa có dữ liệu thật); "ScienceHub phù hợp với ai?" (thay khung lưu ý vàng của trang chủ, trang Đăng ký giữ nguyên); dải Đăng ký + Liên hệ; nút Zalo/Gọi nổi trên điện thoại (tự ẩn ở đầu trang, ở phần Liên hệ và khi đè lên nút khác). Script JS thuần `site/src/scripts/home.js`; tôn trọng `prefers-reduced-motion`.
- Màu của cả web gom thành biến trong `site/src/styles/global.css`: `brand` (xanh dương chính, đổi tên từ `sky`, cùng giá trị), `mint` (xanh lá của logo), `physics` (Vật Lí, xanh dương), `chem` (Hóa học, **đổi sang cam**). Các trang khác không đổi giao diện (so ảnh chụp từng điểm ảnh), trừ nhãn Hóa học ở trang Lớp học/Đăng ký/Tra cứu điểm thành màu cam. App quản lý vẫn để Hóa học màu xanh lá.
- `site/src/lib/catalog.js` thêm `sectionDays`, `daysText`; test JS thêm 2 tình huống (các thứ có ca học, dữ liệu câu hỏi và cấu hình trang chủ). Bỏ `CENTER.intro` (lời giới thiệu cũ, nay viết trong các phần của trang chủ).

### 25/11/2026 — Trang giới thiệu: mốc M3 (form đăng ký học, trang Đơn đăng ký)
- Web: form 4 bước ở trang Đăng ký học (chọn lịch theo phần bằng nút chọn, **mã HS giới thiệu**, ô đồng ý, ô bẫy chống spam); nút "Đăng ký lịch này" ở trang Lớp học mở form chọn sẵn môn + khối. `site/api/dang-ky.js`, `site/server/db.js` (kết nối dùng chung, chỉ thử lại khi đứt kết nối).
- CSDL (`11_website.sql`): bảng `website.registration_requests`, `website.submit_registration` (kiểm tra lại toàn bộ quy tắc chọn lịch, mã giới thiệu, chống gửi trùng/spam), RPC Quản lý `list_registration_requests`, `set_registration_status`, `registration_requests_summary`. Test `v3_website_registration.test.mjs` (13 tình huống).
- App quản lý: mục menu "Đơn đăng ký" (chỉ Quản lý, số đơn mới màu đỏ; thanh tab đáy thành 6 cột), `RegistrationsPage.jsx`; `EnrollStudentModal` nhận thông tin điền sẵn (`initial`) và tiêu đề bước (`step`) để "Xếp lớp" từ đơn.

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
