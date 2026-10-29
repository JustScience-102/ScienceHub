# Tiến độ Dự án & Kế hoạch Triển khai (Roadmap)

> **Câu nhắc mở đầu cho phiên chat mới:**
> "Hãy đọc kỹ `RULES.md`, `ARCHITECTURE.md` và `ROADMAP.md`. Tuân thủ quy trình 3 bước trong `RULES.md`. Production vẫn chạy V2 (nhánh `main`); V3 đang làm trên nhánh `v3` cho project Supabase MỚI — xem mục 0 của `ROADMAP.md` (V3-0 -> V3-3 đã viết xong, đang chờ người dùng diễn tập V3-4). CHƯA viết code mới khi chưa được duyệt kế hoạch."

---

## 0. V3: Xây lại trên project Supabase mới (nhánh `v3`) — ĐANG LÀM
Kế hoạch đã duyệt ngày 29/10/2026. Production V2 (nhánh `main`, project Supabase cũ) KHÔNG bị đụng tới cho tới ngày chuyển và giữ làm phương án quay lui.

**Quy tắc mới đã chốt với người dùng:** (a) dựng V3 sạch trên project Supabase MỚI, chuyển dữ liệu bằng file sao lưu `.json` của V2; (b) lịch học theo thời kỳ ("Áp dụng lịch mới từ ngày"); (c) khóa sổ theo tháng (chỉ tháng đã qua, mở lại bắt buộc ghi lý do); (d) nhật ký V2 không nạp sang, V3 chỉ ghi 1 dòng "Chuyển dữ liệu từ hệ thống cũ"; (e) tên lớp do Database sinh `Môn_Khối_TênGọiGV_STT`, đổi họ tên giáo viên thì tên lớp và nhãn lịch sử đổi theo; hai giáo viên trùng tên gọi (Lam/Lâm) cùng từng dạy một môn thì cả hai thêm chữ `LamA`/`LamB` theo thứ tự thêm vào Trung tâm, đã thêm thì giữ luôn; (f) bộ test DB lưu trong repo (`@electric-sql/pglite` 0.5.8, chỉ dùng lúc phát triển).

**Đã làm (chưa commit, chờ người dùng đồng ý):**
- **V3-0 Bộ test:** `npm test` (= `test:js` + `test:db`). `supabase/tests/` giả lập Supabase (`auth`, vai trò, quyền mặc định) trên PGlite; mỗi lời gọi của người dùng là một giao dịch như PostgREST. Bộ nền chạy chuỗi V2 (`supabase/legacy/`) và xác nhận các kẽ hở V2 (bù 2 lần tính tiền 2 lần, Quản lý sửa thẳng `price_snapshot`, tên lớp nhận nguyên văn từ trình duyệt).
- **V3-1/V3-2 SQL** `supabase/v3/00..09` (+ `bootstrap_manager.sql`, `check_v3.sql`); 13 file V2 dời sang `supabase/legacy/` (không sửa nội dung). Điểm chính: chỉ có quyền SELECT cho `authenticated`, mọi ghi (kể cả Quản lý) qua RPC; RLS Giáo viên dạng tập hợp; quyền mặc định của Supabase bị thu (kể cả EXECUTE cho PUBLIC ở cấp toàn cục); học bù có liên kết buổi gốc, mỗi buổi bù 1 lần, `cancel_makeup` trả buổi gốc về đúng giá cũ; `left_reason` (nghỉ hẳn/đổi lớp/hoàn thành cuối cấp); kiểm tra cùng khối hoãn tới lúc commit + khóa dòng học sinh; khôi phục nhận file V2/V3, chèn theo cột có trong file, nối tài khoản Giáo viên theo email, không `ALTER TABLE` (không khóa bảng).
- **V3-3 Frontend:** `fetchAll` (hết cắt ngầm 1000 dòng), bỏ mọi ghi thẳng bảng (RPC mới `save_teacher`, `set_teacher_hidden`, `set_class_hidden` cho cả Quản lý), xem trước tên lớp từ Database (`preview_class_name`), ô "Áp dụng lịch mới từ ngày" + lịch trước đây, điểm danh lưu theo hàng đợi (bấm liên tục) và dùng dòng máy chủ trả về, nút "Hủy học bù", báo tháng đã chốt sổ, phần "3. Khóa sổ tháng" trong Sao lưu & Năm học, nhãn lý do nghỉ ở danh sách lớp, tách tải riêng trang/hộp thoại của Quản lý. Bỏ `src/lib/className.js` và nút "Xóa học sinh".
- **Đã tự kiểm tra:** `npm test` 9 + 95 tình huống đạt (gồm chuyển file V2 -> V3: dữ liệu khớp từng dòng, học phí từng học sinh từng tháng khớp; sao lưu-khôi phục V3 khứ hồi; chạy lại bộ V3 lần hai vẫn đúng); `npm run lint` 0 cảnh báo; `npm run build` sạch. **Chưa chạy trên Supabase thật và giao diện thật.**

**Đổi cách chuyển (người dùng chốt 29/10/2026):** không giữ song song V2. Gộp diễn tập và chuyển chính thức làm một lần; biến Vercel `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (loại Config) đã trỏ sang project MỚI cho cả Production và Preview. Bản production đang chạy vẫn là bản build cũ (V2) cho tới lần build sau, nên **không push/Redeploy nhánh `main` cho tới khi merge `v3`** (nếu không sẽ thành mã V2 + Database V3).

**Còn lại:**
- **Người dùng đã làm:** tạo project Supabase mới, chạy `supabase/v3/00` -> `09`, tạo user Quản lý/Giáo viên (cùng email cũ), chạy `bootstrap_manager.sql`, đổi biến Vercel.
- **V3-4 Thử trên Preview của nhánh `v3`:** Supabase mới -> Authentication -> URL Configuration: Site URL = `https://science-hub-iota.vercel.app`, Redirect URLs thêm `https://science-hub-iota.vercel.app/**` và địa chỉ Preview. Nếu cần dữ liệu cũ: tải `.json` trên web cũ (Sao lưu & Năm học -> 1) rồi trên Preview vào 6. Khôi phục -> xem trước -> `KHOI PHUC`. Nghiệm thu: Quản lý + Giáo viên, điểm danh, học bù/hủy bù, đổi lịch từ ngày, đổi tên GV, khóa sổ/mở lại. Rủi ro cần đo: thời gian khôi phục so với giới hạn của Supabase; email "Quên mật khẩu" (SMTP mặc định giới hạn số thư).
- **V3-5 Chuyển chính thức:** merge `v3` vào `main` (Vercel build lại production với Database mới). Tạm dừng (Pause) project Supabase cũ vài tuần rồi mới xóa. Viết lại `ARCHITECTURE.md`, `RULES.md`, `README.md` theo V3; rút gọn lịch sử V1/V2 của file này.

---

## 1. Các Lát cắt Đã Hoàn thành & Đã Khóa (V1 + Tối ưu UI)
- [x] **Lát cắt 1 -> 6b (Toàn bộ tính năng V1):**
  - Quản lý Giáo viên, Học sinh, Phụ huynh, Lớp học & Lịch học theo ca (`class_schedules`).
  - Ghi danh, Xóa mềm khi nghỉ học, Đổi lớp & Đăng ký thêm lớp cùng khối.
  - Điểm danh đóng băng đơn giá (`price_snapshot`), Điểm danh giọng nói (Web Speech API) & Học bù cùng giáo viên.
  - Hồ sơ chi tiết Học sinh (tính học phí đa môn theo tháng), Hồ sơ Giáo viên & Dashboard tổng quan.
- [x] **Lát cắt V2-1 (Đăng nhập & Khóa quyền Quản lý):** Đã nghiệm thu trên Supabase thật và khóa (xem mục 2).
- [x] **Lát cắt V2-2 (Tài khoản Giáo viên & Phân quyền theo Lớp):** Đã nghiệm thu trên Supabase thật và khóa (28/10/2026, xem mục 2). Bộ SQL hiện hành là 5 file `01` -> `05`.
- [x] **Chuẩn hóa SQL:** Đã gộp toàn bộ SQL từ Lát cắt 1 đến V2-1 thành 4 file sạch sẽ (`01_schema.sql` -> `04_lockdown_rls.sql`); V2-2 thêm `05_v2_2_teacher_access.sql`.
- [x] **Rà soát sau chuẩn hóa (phiên 27/10/2026):**
  - `03_rpc_and_auth.sql`: `drop_enrollment` và `transfer_enrollment` chuyển sang `SECURITY DEFINER` + `set search_path = public` (vẫn `assert_manager()` ở dòng đầu) để gọi được `_drop_enrollment_core` đã bị thu quyền EXECUTE.
  - `mock_data.sql`: viết lại theo cấu trúc mới (5 lớp `Môn_Khối_TênGV_STT`, lịch ở `class_schedules`, học sinh chỉ học lớp cùng khối, ghi danh `dropped` tạo bằng INSERT `active` rồi UPDATE).
  - `errors.js`, `dashboard.js`, `transfer.js`: thông báo thiếu hàm/cột trỏ về `01_schema.sql` -> `03_rpc_and_auth.sql`; xóa các comment "Lát cắt N" cũ.
  - Cập nhật `ARCHITECTURE.md` (16 trigger, vai trò file 04, `mock_data.sql`), `RULES.md` (mục 3b quy ước SQL), `README.md` (hướng dẫn cài đặt).
  - `npm run lint` và `npm run build` đều sạch lỗi.
- [x] **Chuẩn hóa & Tối ưu Giao diện Frontend (11 file cốt lõi):**
  - `App.jsx`, `AppLayout.jsx`, `errors.js`: Xử lý an toàn lỗi mạng lúc khởi tạo phiên, đồng bộ thông báo lỗi trỏ về bộ 4 file SQL mới, hiển thị nhãn vai trò trên header mobile.
  - `DashboardPage.jsx`: Thêm khung Skeleton 6 thẻ và hiệu ứng chuyển tháng/ngày mượt (`opacity-60`), chống giật bố cục (Layout Shift).
  - `ClassesPage.jsx` & `ClassRoster.jsx`: Bổ sung ô tìm kiếm lớp học, biến tên lớp thành nút chữ xanh mở chi tiết lớp, hiển thị sĩ số trên tab `Học sinh (N)` và chống nháy khi nhảy từ Dashboard sang Điểm danh.
  - `ClassAttendance.jsx`: Tách truy vấn lịch/ghi danh khỏi bản ghi điểm danh ngày; áp dụng **Optimistic UI** lưu tức thì khi bấm từng trạng thái; đưa bảng tóm tắt sĩ số/tiền buổi học lên đầu danh sách; làm nổi bật học sinh `Chưa chấm`.
  - `StudentsPage.jsx`, `StudentProfile.jsx` & `tuition.js`: Tự động làm mới danh sách khi quay về từ hồ sơ học sinh; bổ sung đếm chi tiết số buổi *Có mặt · Vắng · Có phép · Còn lại theo lịch* trên thẻ tổng học phí và từng lớp; khóa nút chuyển sang tháng tương lai.
  - `TeachersPage.jsx`: Bổ sung ô tìm kiếm giáo viên không dấu (theo tên, SĐT, email) và chống bấm đúp khi khôi phục.

---

## 2. Lộ trình V2: Đăng nhập, Phân quyền & Bảo mật (V2-1 -> V2-4 đã nghiệm thu và khóa; còn bước Triển khai Vercel)

### Lát cắt V2-1: Nền tảng Đăng nhập & Khóa quyền Quản lý — ĐÃ NGHIỆM THU & ĐÃ KHÓA (27/10/2026)
- **Đã làm:**
  - SQL: Đã tích hợp đầy đủ trong `01_schema.sql`, `02_triggers.sql`, `03_rpc_and_auth.sql`, `04_lockdown_rls.sql`.
  - Frontend: Đã hoàn thiện đăng nhập, kiểm tra `my_profile()`, hẹn giờ hết hạn phiên 48h, đổi mật khẩu và tối ưu toàn bộ 11 file giao diện.
- **Kết quả nghiệm thu:** Người dùng xác nhận V2-1 đã nghiệm thu xong trên Supabase thật (Quản lý đã đăng nhập thành công từ trước). Chi tiết từng bước kiểm tra do người dùng tự thực hiện, chưa ghi lại từng mục.
- **Việc tồn đọng nhỏ từ V2-1:** `sync_parent_visibility` và `class_effective_grade` đã được thu quyền `anon` ở `05_v2_2_teacher_access.sql`. Các việc còn lại xem cuối mục V2-2.

---

### Lát cắt V2-2: Tài khoản Giáo viên & Phân quyền theo Lớp — ĐÃ NGHIỆM THU & ĐÃ KHÓA (28/10/2026)
- **Đã làm:**
  - SQL: `supabase/05_v2_2_teacher_access.sql` (chạy sau file 04, chạy lại được nhiều lần; KHÔNG chạy lại file 03 sau file 05):
    - Thu quyền `anon`/`public` của `sync_parent_visibility`, `class_effective_grade`.
    - Hàm trợ giúp RLS `SECURITY DEFINER` (`teacher_owns_class`, `teacher_owns_enrollment`, `teacher_sees_enrollment`, `teacher_sees_student`, `teacher_sees_parent`) để các policy của `class_enrollments`, `attendance_records`, `students`, `parents` không gọi vòng nhau (tránh đệ quy RLS).
    - Policy `SELECT` cho Giáo viên trên 7 bảng; Giáo viên KHÔNG có quyền ghi trực tiếp, mọi thao tác ghi đi qua RPC.
    - RPC mới: `link_teacher_account`, `set_teacher_account_active`, `lookup_parent_by_phone`, `enroll_existing_student`, `set_class_hidden`, `assert_staff`.
    - Nâng cấp 8 RPC: `save_class`, `update_student`, `register_student_in_class`, `drop_enrollment`, `transfer_enrollment`, `save_attendance`, `record_makeup`, `dashboard_summary` (nhánh Giáo viên tự tính riêng theo lớp mình).
  - Frontend: lọc menu theo vai trò, trang mặc định của Giáo viên là Lớp học, thanh thống kê riêng (`TeacherStatsBar`), khóa ô giáo viên trong `ClassForm`, khóa điểm danh tháng cũ, giới hạn ngày (cho nghỉ, đổi lớp, vào lớp, học bù) trong tháng hiện tại, tra cứu SĐT phụ huynh qua RPC, ghi danh qua `enroll_existing_student`, nhãn và thao tác tài khoản ở trang Giáo viên.
- **Quy tắc đã chốt thêm khi làm V2-2 (đã ghi vào `ARCHITECTURE.md` 2.2):**
  - Giáo viên không được đổi tên phụ huynh; SĐT trùng phụ huynh có sẵn thì tên bị khóa. Khi sửa học sinh sang SĐT phụ huynh chưa có: phụ huynh hiện tại chỉ có 1 con thì chỉ đổi SĐT (giữ tên), ngược lại tạo phụ huynh mới.
  - Giáo viên chỉ sửa học sinh đang `'active'` ở lớp mình; vẫn xem được học sinh đã nghỉ khỏi lớp mình (giữ lịch sử).
  - Giáo viên ghi danh học sinh với ngày vào lớp trong tháng hiện tại; không có UPDATE trực tiếp trên `classes` (ẩn/khôi phục qua `set_class_hidden`).
  - Số lớp và số học sinh trên thanh thống kê là con số hiện tại; chỉ doanh thu theo tháng đang chọn.
  - Đổi giáo viên của lớp thì lịch sử và doanh thu của lớp theo sang giáo viên mới.
  - Liên kết lại một giáo viên với email khác sẽ xóa dòng `profiles` của tài khoản cũ (tài khoản cũ mất quyền vào hệ thống).
- **Kết quả nghiệm thu:** Người dùng xác nhận V2-2 đã nghiệm thu xong trên Supabase thật (28/10/2026) theo kịch bản: chạy `05_v2_2_teacher_access.sql`, liên kết tài khoản giáo viên, đăng nhập bằng giáo viên và kiểm tra phạm vi lớp/học sinh/doanh thu, khóa điểm danh tháng cũ, các thao tác lớp/học sinh/điểm danh/học bù/cho nghỉ/đổi lớp. Chi tiết từng bước do người dùng tự thực hiện, chưa ghi lại từng mục; lint và build sạch khi bàn giao.
- **Trạng thái Database (phiên sau nên xác nhận nhanh với người dùng trước khi viết `06_...`):** coi như `01` -> `05` đã chạy. Có thể kiểm tra bằng `select count(*) from pg_policies where schemaname = 'public' and policyname like 'v2_teacher_%';` (phải ra 7) và `select role, teacher_id, active from public.profiles;`. Dữ liệu nghiệp vụ hiện là dữ liệu thử, chưa nhập dữ liệu thật. Từ nay KHÔNG chạy lại `03_rpc_and_auth.sql` (sẽ ghi đè 8 hàm đã nâng cấp ở file 05).
- **File đã khóa bởi V2-2 (muốn sửa phải xin duyệt trong Kế hoạch Bước 1):** `supabase/05_v2_2_teacher_access.sql`, `App.jsx`, `navItems.js`, `Sidebar.jsx`, `BottomNav.jsx`, `ClassesPage.jsx`, `ClassForm.jsx`, `ClassRoster.jsx`, `ClassAttendance.jsx`, `MakeupModal.jsx`, `DropEnrollmentDialog.jsx`, `EnrollStudentModal.jsx`, `RegisterStudentFlow.jsx`, `StudentsPage.jsx`, `StudentProfile.jsx`, `AddClassModal.jsx`, `TransferClassModal.jsx`, `TeachersPage.jsx`, `TeacherProfile.jsx`, `RowActions.jsx`, `errors.js`, `lib/schedule.js`, và các file mới `TeacherStatsBar.jsx`, `TeacherAccountPanel.jsx`, `AccountBadge.jsx`, `lib/teacherAccount.js`.
- **Việc tồn đọng nhỏ (không chặn):**
  - `setup_initial_manager` vẫn chỉ chạy trong SQL Editor (muốn nhiều Quản lý thì làm hàm riêng).
  - Chưa có chức năng gỡ liên kết tài khoản giáo viên; muốn đổi tài khoản thì liên kết lại bằng email mới (tài khoản cũ mất quyền vào hệ thống).
  - Thư mục `sciencehub-tmp/` (nếu còn) có thể xóa tay.

---

### Lát cắt V2-3: Nhật ký Thay đổi (`audit_log`) — ĐÃ NGHIỆM THU & ĐÃ KHÓA (28/10/2026)
- **Kết quả nghiệm thu:** Người dùng xác nhận đã kiểm tra trên Supabase thật: các thao tác điểm danh, học bù, ghi danh/cho nghỉ/đổi lớp, lớp học, học sinh, tài khoản giáo viên đều được ghi vào nhật ký. Lỗi "không chọn được học sinh khi học bù" là do thao tác (ngày học bù sớm hơn ngày vào lớp), không phải lỗi code. Phiên rà soát cùng ngày: `npm run lint`, `npm run build` sạch lỗi; thăm dò API bằng khóa `anon` xác nhận `audit_log` và các RPC V2-3/V2-4 bị chặn với người chưa đăng nhập.
- **Đã làm:**
  - SQL: `supabase/06_v2_3_audit_log.sql` (chạy sau file 05, chạy lại được nhiều lần; KHÔNG chạy lại file 03):
    - Bảng `audit_log` (RLS chỉ Quản lý `SELECT`; `authenticated` bị thu `INSERT/UPDATE/DELETE/TRUNCATE`; trigger chặn UPDATE/DELETE/TRUNCATE).
    - 9 trigger ghi tự động trên `attendance_records`, `class_enrollments`, `classes`, `class_schedules` (2 trigger cấp câu lệnh), `students`, `parents`, `teachers`, `profiles` + 2 trigger bảo vệ nhật ký. Ghi cả vai trò, `teacher_id`, tên người thực hiện, `price_snapshot` đóng băng cũ/mới, và `batch_id` (mã giao dịch) để giao diện gộp theo lần bấm.
    - RPC chỉ Quản lý: `vn_school_year_bounds`, `query_audit_logs`, `clear_audit_logs_before`.
  - Frontend mới: `src/lib/auditLog.js`, `src/components/audit/AuditLogModal.jsx`.
  - File khóa đã chạm (đã được duyệt trong kế hoạch): `errors.js` (thêm nhánh mới trước nhánh cũ), `DashboardPage.jsx` (nút Nhật ký thay đổi), `ClassRoster.jsx` (nút Lịch sử lớp), `StudentProfile.jsx` (nút Lịch sử thay đổi); 2 nút sau chỉ hiện khi `!isTeacher`.
- **Quy tắc đã chốt khi làm V2-3 (đã ghi vào `ARCHITECTURE.md` mục 2.3 và 2.4):**
  - (a) Ghi 6 nhóm: điểm danh, học bù, ghi danh/cho nghỉ/đổi lớp, lớp học (kèm đổi lịch học), học sinh (kèm sửa phụ huynh), giáo viên và tài khoản (kèm gỡ tài khoản cũ khi liên kết lại). (b) Ghi từng dòng, gộp khi hiển thị. (c) Giữ theo Năm học 15/06 -> 12/06; xóa nhật ký cũ chỉ qua `clear_audit_logs_before` (ngoại lệ có kiểm soát, đã được duyệt). (d) Nút ở Tổng quan + nút Lịch sử trong chi tiết lớp và hồ sơ học sinh; bộ lọc theo ngày, vai trò, giáo viên, loại thao tác, từ khóa.
  - Đổi lớp tạo 2 dòng (Ghi danh lớp mới + Đổi lớp); giao diện ẩn dòng Ghi danh thừa. Thay đổi cột `grade` do trigger tự gán không bị ghi như một lần sửa học sinh.
- **Đã tự kiểm tra:** `npm run lint` và `npm run build` sạch lỗi; cú pháp SQL file 06/07 qua trình phân tích Postgres (`pglast`); kiểm thử hàm JS thuần (CSV, gộp nhóm, năm học). **Chưa chạy SQL trên Supabase thật** nên 3 điểm cần để mắt khi nghiệm thu: (1) trigger `class_schedules` cấp câu lệnh dùng bảng chuyển tiếp (`referencing`), (2) phát hiện Đổi lớp dựa vào `created_at = transaction_timestamp()`, (3) ghi nhật ký khi xóa điểm danh.
- **Kịch bản nghiệm thu V2-3:**
  1. Trong Supabase SQL Editor chạy `06_v2_3_audit_log.sql` (không chạy lại file 03). Kiểm tra: `select count(*) from pg_trigger where tgname like 'trg_audit_%' and not tgisinternal;` (mong đợi 11).
  2. Đăng nhập Giáo viên: điểm danh một buổi (bấm "Tất cả có mặt"), sửa một em từ Có mặt sang Vắng, ghi một buổi học bù, cho một em nghỉ, đổi lớp một em, ẩn rồi khôi phục một lớp. Mở Console chạy `supabase.from('audit_log').select('*')` — kết quả phải là mảng rỗng (hoặc lỗi quyền), Giáo viên không đọc được nhật ký.
  3. Đăng nhập Quản lý: **Tổng quan -> Nhật ký thay đổi**: thấy đúng người (GV ...), vai trò, giờ `DD/MM/YYYY HH:mm:ss`; điểm danh cả buổi gộp thành 1 nhóm; bấm **Chi tiết** thấy `Đơn giá đóng băng` cũ/mới đúng; đổi lớp hiện 1 dòng "Đổi lớp". Đổi đơn giá lớp rồi điểm danh lại một em đã có giá: giá cũ trong nhật ký không đổi.
  4. Sửa lịch học của một lớp, sửa SĐT phụ huynh, liên kết lại một giáo viên sang email khác: thấy các dòng "Đổi lịch học", "Sửa phụ huynh", "Gỡ TK GV cũ" + "Liên kết TK GV".
  5. Vào chi tiết một lớp -> **Lịch sử lớp**; vào hồ sơ một học sinh -> **Lịch sử thay đổi**: chỉ thấy nhật ký của đúng lớp/học sinh đó. Đăng nhập Giáo viên: không thấy 2 nút này.
  6. Trong SQL Editor thử `delete from public.audit_log;` và `truncate public.audit_log;` — bị chặn với thông báo "Nhật ký thay đổi được bảo vệ toàn vẹn...". Từ trình duyệt (Console) thử `supabase.from('audit_log').delete().neq('id','00000000-0000-0000-0000-000000000000')` — bị từ chối quyền (đây là hành vi đúng).

---

### Lát cắt V2-4: Sao lưu Thủ công & Đóng gói Triển khai (Vercel) — ĐÃ NGHIỆM THU & ĐÃ KHÓA (28/10/2026)
- **Kết quả nghiệm thu:** Người dùng xác nhận đã kiểm tra sao lưu JSON/CSV trên Supabase thật và thấy ổn. Phần triển khai Vercel (mục 5-6 của kịch bản dưới đây) được thực hiện ở mục "Triển khai Vercel" cuối file.
- **Đã làm:**
  - SQL: `supabase/07_v2_4_backup.sql` (chạy sau file 06): `export_center_backup(p_include_audit_log, p_tables)` và `export_monthly_attendance_report(p_year, p_month)`, chỉ Quản lý; mỗi lần xuất ghi 1 dòng nhật ký `backup_export`. Tiện ích tùy chọn: `supabase/check_before_launch.sql` (chỉ đọc, 10 truy vấn kiểm tra an toàn) và `supabase/reset_mock_data.sql` (xóa dữ liệu thử, có khóa an toàn ở đầu file).
  - Frontend mới: `src/lib/backup.js`, `src/components/backup/BackupModal.jsx`; nút **Sao lưu & Năm học** ở Tổng quan.
  - `vercel.json` ở thư mục gốc: SPA rewrite + `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (giữ `microphone=(self)` cho Điểm danh giọng nói) + `Content-Security-Policy-Report-Only` (chưa chặn, chỉ báo cáo; chuyển sang chế độ chặn sau khi kiểm tra trên bản triển khai thật không có cảnh báo).
- **An toàn khi xóa nhật ký cuối năm học:** một ngày chốt dùng chung cho bước tải và bước xóa; chỉ xóa được khi file vừa tải khớp đúng số dòng (`p_expected_count`), ngày chốt là ngày đã qua, và gõ đúng `XOA NHAT KY`. Đổi ngày chốt thì phải tải lại.
- **Kịch bản nghiệm thu V2-4:**
  1. Chạy `07_v2_4_backup.sql`, `npm run lint`, `npm run build`.
  2. **Tổng quan -> Sao lưu & Năm học**: tải bản sao lưu `.json`, mở kiểm tra đủ các bảng; xuất 3 file `.csv`, mở bằng Excel: tiếng Việt có dấu đúng, SĐT giữ số 0 đầu, học sinh sắp theo tên gọi, học phí tháng khớp tổng ở hồ sơ học sinh. Trong nhật ký có thêm các dòng "Xuất sao lưu".
  3. Mục 3 (Kết thúc Năm học): chọn ngày chốt là một ngày đã qua có nhật ký -> Bước 1 tải file -> ô xác nhận mở -> gõ `XOA NHAT KY` -> xóa; nhật ký chỉ còn các dòng sau ngày chốt cộng 1 dòng "Làm mới nhật ký". Thử đổi ngày chốt sau khi tải: ô xác nhận phải khóa lại.
  4. Chạy `check_before_launch.sql` và đối chiếu kết quả mong đợi ghi trong từng truy vấn.
  5. Triển khai Vercel: chỉ làm SAU khi nghiệm thu xong V2-3 và V2-4. Trước đó vào Supabase Authentication tắt đăng ký tự do, đặt Site URL và Redirect URL theo tên miền Vercel; kiểm tra không có khóa `service_role` trong code/`.env`/biến `VITE_*`. Xem Console trình duyệt có cảnh báo CSP không trước khi đổi sang chế độ chặn.
  6. Khi chuyển sang dữ liệu thật: tải 1 bản sao lưu `.json`, bỏ khối "KHÓA AN TOÀN" trong `reset_mock_data.sql` rồi chạy; xóa tay các tài khoản giáo viên thử trong Authentication.
- **File mới của V2-3/V2-4 (khóa sau khi nghiệm thu):** `supabase/06_v2_3_audit_log.sql`, `supabase/07_v2_4_backup.sql`, `supabase/check_before_launch.sql`, `supabase/reset_mock_data.sql`, `src/lib/auditLog.js`, `src/lib/backup.js`, `src/components/audit/AuditLogModal.jsx`, `src/components/backup/BackupModal.jsx`, `vercel.json`; cùng 4 file khóa V2-2 đã chạm ở trên.
- **Việc tồn đọng nhỏ (không chặn):** chưa có chức năng khôi phục dữ liệu từ file sao lưu (chỉ xuất); bundle JS ~656 kB (chỉ cảnh báo, có thể tách bằng `import()` sau); `setup_initial_manager` vẫn chỉ chạy trong SQL Editor.

---

## 3. Triển khai Vercel — HOÀN TẤT (29/10/2026)
Địa chỉ chạy thật: https://science-hub-iota.vercel.app (CSP đã ở chế độ chặn; người dùng `anon` chỉ nhận mảng rỗng/bị từ chối). Hệ thống sẵn sàng nhập dữ liệu thật. Việc tiếp theo: nhập giáo viên thật, tạo tài khoản và liên kết; tải sao lưu `.json` định kỳ (gói Supabase Free không có sao lưu tự động).
Điều kiện đã đạt: V2-1 -> V2-4 đã nghiệm thu; lint/build sạch; không có `service_role` trong code/`.env`; `.env` nằm trong `.gitignore`; `vercel.json` hợp lệ.
- [x] 1. Đã đẩy mã lên GitHub `JustScience-102/ScienceHub` (branch `main`; `.env` không bị theo dõi, không lộ khóa).
- [x] 2. (Đã triển khai tại https://science-hub-iota.vercel.app, header bảo mật và SPA rewrite đã kiểm tra OK) Vercel: Import kho, Framework Vite, Build `npm run build`, Output `dist`; thêm biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production + Preview).
- [x] 3. (Đã xác nhận `disable_signup = true`) Supabase Authentication: Site URL = tên miền Vercel; thêm Redirect URL `https://<tên-miền>/**`; tắt đăng ký tự do (Allow new users to sign up = OFF).
- [x] 4. (Người dùng xác nhận OK 29/10/2026: đăng nhập Quản lý/Giáo viên, đặt lại mật khẩu, Console không có cảnh báo CSP) Thử trên bản triển khai: đăng nhập Quản lý, đăng nhập Giáo viên, "Quên mật khẩu" (email quay về đúng tên miền), điểm danh giọng nói (cần HTTPS + quyền micro).
- [x] 5. (Đã đổi sang chế độ chặn 29/10/2026) Mở Console xem có cảnh báo CSP không; nếu sạch thì đổi `Content-Security-Policy-Report-Only` thành `Content-Security-Policy` trong `vercel.json` (file khóa, cần duyệt) rồi triển khai lại.
- [x] 6. (Người dùng xác nhận đã chạy 29/10/2026) Chạy `check_before_launch.sql` lần cuối trên Database.
- [x] 7. (Đã dọn dữ liệu thử 29/10/2026; người dùng xác nhận dữ liệu cũ chỉ là mock nên không cần sao lưu) Chuyển sang dữ liệu thật: tải 1 bản sao lưu `.json`, bỏ khối "KHÓA AN TOÀN" trong `reset_mock_data.sql` rồi chạy; xóa tay tài khoản giáo viên thử trong Authentication; tạo lại giáo viên thật + liên kết tài khoản.

---

## 4. Lát cắt V2-5: Nhập học sinh hàng loạt từ file CSV — ĐÃ NGHIỆM THU & ĐÃ KHÓA (29/10/2026)
- **Quy tắc đã chốt với người dùng:** (a) CSV (không cài thư viện đọc Excel; Excel -> Save As CSV UTF-8). (b) Mỗi dòng gán lớp bằng cột "Tên lớp"; lớp phải được tạo trước. (c) Xem trước; còn bất kỳ lỗi nào thì không nhập gì (một giao dịch). (d) Chỉ Quản lý. (e) Học sinh nhận diện bằng Họ tên + SĐT phụ huynh; đã có thì chỉ ghi danh thêm lớp. (f) Họ tên phụ huynh không bắt buộc, để trống dùng tên tạm `(Chưa cập nhật tên)`, sửa sau ở hồ sơ học sinh; SĐT phụ huynh vẫn bắt buộc.
- **Đã làm:**
  - SQL: `supabase/08_v2_5_bulk_import.sql` (RPC `import_students_bulk`, chạy lại an toàn).
  - Frontend mới: `src/lib/importStudents.js`, `src/components/students/ImportStudentsModal.jsx`.
  - File khóa đã chạm (đã được duyệt): `StudentsPage.jsx` (nút "Nhập từ file", chỉ Quản lý), `errors.js` (nhánh mới đặt trước).
- **Đã tự kiểm tra:** `npm run lint`, `npm run build` sạch. Chạy thật chuỗi `01 -> 08` trên Postgres 18 (PGlite) và 30 tình huống của RPC đều đạt: dry-run không ghi/không tiêu hao mã, lỗi từng dòng, lớp thiếu/lớp ẩn, ngày sai/tương lai, nhập thật đúng mã HS/PH và khối, nhập lại bỏ qua, học sinh có sẵn, phụ huynh khác tên, khác khối, trùng SĐT, anh chị em cùng SĐT phụ huynh, quá 500 dòng, người không phải Quản lý bị từ chối, nhật ký tự ghi. 15 tình huống đọc CSV đạt (dấu `;`/`,`, BOM, CRLF, ngoặc kép, mất số 0, ngày D/M/YYYY, lỗi font, thiếu cột).
- **Kịch bản nghiệm thu (người dùng làm):**
  1. Chạy `08_v2_5_bulk_import.sql` trong Supabase SQL Editor; `git push` để Vercel triển khai.
  2. Tạo sẵn giáo viên và lớp. Học sinh -> **Nhập từ file**: tải **file mẫu** và **danh sách tên lớp**.
  3. Điền thử ~5 dòng (có 1 em học 2 lớp, 1 dòng để trống tên phụ huynh, 1 dòng cố ý sai: lớp không tồn tại hoặc SĐT sai), lưu CSV UTF-8, chọn file: phải thấy lỗi theo dòng và KHÔNG nhập gì.
  4. Sửa dòng sai, chọn lại: phải báo hợp lệ + số liệu; bấm Nhập: học sinh xuất hiện đúng lớp/khối, phụ huynh có tên "(Chưa cập nhật tên)" ở dòng để trống.
  5. Chọn lại đúng file đó: báo không có gì mới (các dòng bỏ qua). Mở Nhật ký thay đổi: thấy các dòng tạo học sinh/ghi danh. Đăng nhập Giáo viên: không thấy nút "Nhập từ file".
- **Kết quả:** Người dùng đã nhập thử và xác nhận ổn (29/10/2026). **Danh sách file khóa của V2-5:** `supabase/08_v2_5_bulk_import.sql`, `src/lib/importStudents.js`, `src/components/students/ImportStudentsModal.jsx`; `StudentsPage.jsx` và `errors.js` vốn đã khóa.

---

## 5. Lát cắt V2-6: Chuyển năm học & Lịch sử nhãn lớp — ĐÃ NGHIỆM THU & ĐÃ KHÓA (29/10/2026)
- **Kết quả nghiệm thu V2-6:** Người dùng đã chạy thử trên Supabase thật và xác nhận ổn (29/10/2026).
- **Quy tắc đã chốt với người dùng:** (a) Phương án B: không chép điểm danh, chỉ lưu nhãn lớp theo thời kỳ (`class_versions`). (b) Trigger tự lưu nhãn cũ mỗi lần đổi tên/môn/khối/STT/giáo viên của lớp. (c) Giáo viên xem được nhãn cũ của lớp mình. (d) Lớp cuối cấp là khối **5, 9, 12**: cho nghỉ hết học sinh rồi ẩn lớp; các lớp còn lại lên 1 khối và đổi tên. (e) Học sinh lưu ban xử lý tay. (f) Ngày chuyển do Quản lý chọn. (g) Cột lý do nghỉ (tốt nghiệp / nghỉ hẳn) để sau: thẻ "học sinh xin nghỉ hẳn" trên Tổng quan sẽ tính cả học sinh lớp cuối cấp vào tháng chuyển.
- **Đã làm:**
  - SQL: `supabase/09_v2_6_year_rollover.sql` (bảng `class_versions`, trigger `trg_class_versions`, `class_label_on`, `rollover_school_year`, bản nới `check_class_grade_change`, nâng cấp `query_audit_logs` / `export_center_backup` / `export_monthly_attendance_report`). `02_triggers.sql` thêm chốt chặn từ chối chạy lại sau khi có `class_versions`.
  - Frontend mới: `src/lib/rollover.js`, `src/lib/classVersions.js`, `src/components/backup/RolloverSection.jsx`.
  - File khóa đã chạm (đã được duyệt): `02_triggers.sql` (chỉ thêm chốt chặn; hàm trigger được thay bằng `09`), `BackupModal.jsx` (nhúng phần 4), `StudentProfile.jsx` (nhãn lớp theo ngày), `errors.js` (nhánh mới đặt trước), `auditLog.js` (nhãn thao tác `school_year_rollover`). `tuition.js` và `ClassAttendance.jsx` không phải sửa.
- **Đã tự kiểm tra:** `npm run lint`, `npm run build` sạch. Chạy chuỗi `01 -> 09` (và `09` hai lần) trên Postgres (PGlite): 52 tình huống đạt, gồm: sửa tay khối lớp của học sinh học 2 môn vẫn bị chặn; xem trước không ghi gì (lớp, phiên bản, nhật ký, ghi danh y nguyên); ngày chuyển sớm/tương lai/sai cụm xác nhận/không phải Quản lý bị từ chối; chạy thật đóng đúng lớp 5, 9, 12 (học sinh và phụ huynh tự ẩn, `left_at` = ngày chuyển - 1), lớp còn lại lên khối đúng tên, học sinh học 2 lớp lên khối cùng nhau; `class_label_on` trả nhãn cũ cho ngày cũ và nhãn mới từ ngày chuyển; báo cáo điểm danh tháng cũ hiện tên lớp cũ, học phí và `price_snapshot` nguyên vẹn; đổi giáo viên sinh phiên bản, sửa nhiều lần cùng ngày/đổi đơn giá không sinh dòng; Giáo viên chỉ đọc phiên bản lớp mình, `anon` bị chặn, không UPDATE/DELETE/TRUNCATE/INSERT được; nhật ký ghi "khối: 10 -> 11" và dòng chuyển năm học; sao lưu JSON có `class_versions`; chạy lại `02` sau `09` bị chặn; `check_before_launch` vẫn đạt (7 policy giáo viên, 11 trigger nhật ký, mọi bảng bật RLS). 10 tình huống hàm JS `classVersions.js` đạt. **Chưa thử trên giao diện thật** (cần bạn nghiệm thu).
- **Danh sách file khóa của V2-6:** `supabase/09_v2_6_year_rollover.sql`, `src/lib/rollover.js`, `src/lib/classVersions.js`, `src/components/backup/RolloverSection.jsx`; cùng `02_triggers.sql`, `BackupModal.jsx`, `StudentProfile.jsx`, `errors.js`, `auditLog.js` vốn đã khóa.
- **Kịch bản nghiệm thu (người dùng làm):**
  1. Chạy `09_v2_6_year_rollover.sql` trong Supabase SQL Editor (không chạy lại `02` và `03`); `git push` để Vercel triển khai.
  2. Tạo dữ liệu thử (hoặc dùng dữ liệu hiện có): vài lớp ở các khối khác nhau (có khối 5/9/12), có 1 học sinh học 2 lớp cùng khối và có điểm danh vài buổi trong tháng này.
  3. Tổng quan -> **Sao lưu & Năm học** -> phần **4. Chuyển năm học**: bấm tải sao lưu (Bước 1), chọn ngày chuyển (ngày sau buổi điểm danh cuối; nếu báo "đã có điểm danh từ ngày..." thì chọn ngày muộn hơn), bấm **Xem trước**: kiểm tra danh sách lớp đóng/lớp lên khối và tên mới. Xem trước không làm đổi gì (vào Lớp học để xác nhận).
  4. Gõ `CHUYEN NAM HOC` -> **Chuyển năm học**: các lớp đã lên khối và đổi tên, lớp cuối cấp đã ẩn, học sinh lớp cuối cấp biến mất khỏi danh sách (bật "Hiện cả học sinh đã ẩn" để thấy), học sinh 2 lớp lên khối mới bình thường.
  5. Mở hồ sơ học sinh đó, chọn tháng có điểm danh trước ngày chuyển: tên lớp vẫn là tên lớp cũ (khối cũ), học phí không đổi; tháng sau ngày chuyển hiện tên lớp mới. Xuất CSV Điểm danh & Học phí của tháng cũ: tên lớp cũ.
  6. **Nhật ký thay đổi** (nhóm Hệ thống): có dòng "Chuyển năm học"; nhóm Lớp học có các dòng "khối: 10 -> 11" cùng một lần chạy.
  7. Đăng nhập Giáo viên: không thấy phần Sao lưu & Năm học; hồ sơ học sinh của lớp mình vẫn hiện tên lớp cũ ở tháng cũ.

---

## 6. Lát cắt V2-7: Khôi phục từ file sao lưu — ĐÃ NGHIỆM THU & ĐÃ KHÓA (29/10/2026)
- **Quy tắc đã chốt với người dùng:** (a) Thay thế hoàn toàn bằng nội dung file, không trộn dữ liệu mới và cũ. (b) Giữ nguyên tài khoản Quản lý và toàn bộ nhật ký thay đổi (chỉ ghi thêm dòng "Khôi phục từ sao lưu"; nhật ký trong file không nạp lại). (c) Tài khoản Giáo viên lấy theo file nếu tài khoản còn trong Authentication. (d) `class_versions` thay theo file (file cũ không có thì làm trống). (e) Ngoại lệ có kiểm soát của quy tắc cấm xóa dữ liệu nghiệp vụ, đã ghi vào `RULES.md`. (f) Bộ đếm mã HS/PH không lùi.
- **Đã làm:**
  - SQL: `supabase/10_v2_7_restore_backup.sql` (bảng tạm `restore_staging`, `restore_stage_chunk`, `restore_stage_abort`, `restore_center_backup`, `_restore_apply`, nâng cấp `query_audit_logs`). `09_v2_6_year_rollover.sql` thêm chốt chặn từ chối chạy lại sau file 10.
  - Frontend mới: `src/lib/restore.js`, `src/components/backup/RestoreSection.jsx` (phần "5. Khôi phục từ file sao lưu" trong hộp Sao lưu & Năm học).
  - File khóa đã chạm (đã được duyệt): `BackupModal.jsx` (nhúng phần 5), `errors.js` (nhánh mới đặt trước, gồm báo hết thời gian chờ của máy chủ), `auditLog.js` (nhãn thao tác `center_restore`), `09_v2_6_year_rollover.sql` (chỉ thêm chốt chặn).
- **Đã tự kiểm tra:** `npm run lint`, `npm run build` sạch. Chạy chuỗi `01 -> 10` (và `10` hai lần) trên Postgres (PGlite): 52 tình huống đạt, gồm: xuất sao lưu -> thay đổi lớn (học sinh mới, điểm danh, đổi tên, chuyển năm học) -> tải file lên theo từng phần -> xem trước hoàn tác hoàn toàn (mọi bảng, nhật ký, trigger y nguyên) -> khôi phục thật: MỌI bảng nghiệp vụ khớp từng byte với trạng thái lúc sao lưu (kể cả `class_versions`, `price_snapshot`, tài khoản giáo viên), tài khoản Quản lý và nhật ký được giữ (có thêm dòng `center_restore`, không lùi), bộ đếm mã không lùi, trigger bật lại và hoạt động (chặn khác khối trở lại), bảng tạm được dọn. Các ca lỗi: sai cụm xác nhận, Giáo viên/`anon` bị từ chối, không đọc được bảng tạm, không nạp được `audit_log`, mã tải lên không tồn tại, thiếu bảng bắt buộc, file bị cắt, sai tên Trung tâm, thiếu một phần tải lên, khóa ngoại sai (xem trước báo lỗi, áp dụng thật bị hủy, dữ liệu và trigger y nguyên), file cũ không có `class_versions`/`profiles`, tài khoản Authentication đã bị xóa (bỏ qua và cảnh báo), chạy lại `09` sau `10` bị chặn, `09` vẫn đạt 52 tình huống của V2-6. 11 tình huống hàm JS thuần của `restore.js` đạt. **Chưa thử trên giao diện và Supabase thật.**
- **Rủi ro cần nghiệm thu trên Supabase thật:** máy chủ có giới hạn thời gian chờ cho mỗi lệnh (thường vài giây với người dùng đã đăng nhập). Khôi phục chạy trong một giao dịch nên nếu bị ngắt thì không thay đổi gì và hiện thông báo "mất quá nhiều thời gian". Hãy thử với dữ liệu thử có quy mô gần thực tế; nếu gặp lỗi này, báo lại để xử lý riêng.
- **Danh sách file khóa của V2-7:** `supabase/10_v2_7_restore_backup.sql`, `src/lib/restore.js`, `src/components/backup/RestoreSection.jsx`; cùng `BackupModal.jsx`, `errors.js`, `auditLog.js`, `09_v2_6_year_rollover.sql` vốn đã khóa.
- **Kịch bản nghiệm thu (người dùng làm, trên dữ liệu thử):**
  1. Chạy `10_v2_7_restore_backup.sql` trong Supabase SQL Editor (không chạy lại `02`, `03`, `09`); `git push` để Vercel triển khai.
  2. Tổng quan -> **Sao lưu & Năm học** -> Phần 1: tải bản sao lưu `.json` (đây là "điểm quay lại"). Ghi nhớ số học sinh, số lớp, tên các lớp lúc này.
  3. Làm vài thay đổi: thêm học sinh mới, điểm danh thêm vài buổi, sửa tên một lớp (hoặc chạy chuyển năm học thử).
  4. Phần **5. Khôi phục từ file sao lưu**: chọn file ở bước 2 (thấy ngày giờ xuất và số liệu); Bước 2 tải sao lưu hiện tại; Bước 3 bấm **Tải file lên và xem trước**: bảng so sánh hiện số "Sẽ mất" đúng với những gì vừa thêm. Vào Lớp học/Học sinh kiểm tra dữ liệu vẫn nguyên (xem trước không đổi gì).
  5. Gõ `KHOI PHUC` -> **Khôi phục** -> **Tải lại trang**: dữ liệu về đúng như lúc sao lưu (học sinh mới biến mất, tên lớp cũ trở lại, điểm danh cũ nguyên giá tiền).
  6. **Nhật ký thay đổi** (nhóm Hệ thống): có dòng "Khôi phục từ sao lưu" và các dòng nhật ký trước đó vẫn còn. Đăng nhập lại bằng tài khoản Quản lý bình thường; đăng nhập thử Giáo viên (tài khoản còn trong Authentication) thấy đúng lớp của mình.
  7. Thử chọn một file không phải sao lưu (ví dụ file ảnh hoặc `.json` bất kỳ): phải báo lỗi tiếng Việt, không đổi gì.
- **Kết quả nghiệm thu V2-7:** Người dùng xác nhận đã nghiệm thu xong (29/10/2026).
