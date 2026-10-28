# Kiến trúc & Nghiệp vụ Hệ thống ScienceHub (Nguồn chân lý hiện hành)

## 1. Cấu trúc Database (Supabase PostgreSQL)

### 1.1. Thứ tự chạy file SQL trong `supabase/`
1. `01_schema.sql`: Sequences, hàm tiện ích thời gian (`vn_today`, `vn_month_start`, `vn_day_of_week`, `class_effective_grade`) và 8 bảng chuẩn.
2. `02_triggers.sql`: Toàn bộ 16 trigger (13 nhóm quy tắc) kiểm soát toàn vẹn dữ liệu và đồng bộ ẩn/hiện.
3. `03_rpc_and_auth.sql`: Các hàm kiểm tra vai trò (`app_role`, `is_manager`, `current_teacher_id`, `my_profile`, `setup_initial_manager`, `assert_manager`) và 10 hàm RPC nghiệp vụ (`drop_enrollment`, `transfer_enrollment` là `SECURITY DEFINER` vì gọi hàm lõi `_drop_enrollment_core` đã bị thu quyền EXECUTE; quyền thật được chốt bởi `assert_manager()`).
4. `04_lockdown_rls.sql`: Chốt chặn an toàn (yêu cầu có ít nhất 1 Quản lý đang hoạt động), thay policy mở `v1_open_access` (do `01_schema.sql` tạo tạm, RLS đã được bật từ file 01) bằng `v2_manager_all` và thu hồi quyền `anon`.
5. `mock_data.sql` (tùy chọn): Dữ liệu giả lập theo đúng cấu trúc mới (lớp tên `Môn_Khối_TênGV_STT`, lịch ở `class_schedules`, học sinh chỉ học các lớp cùng khối). Chạy sau file 03, chỉ trên Database trống; xóa trước khi nhập dữ liệu thật.
6. `05_v2_2_teacher_access.sql` (V2-2): chạy sau file 04. Thêm hàm trợ giúp RLS cho Giáo viên, policy `SELECT` cho Giáo viên, RPC quản lý tài khoản Giáo viên, và **nâng cấp 8 hàm RPC cũ** (`save_class`, `update_student`, `register_student_in_class`, `drop_enrollment`, `transfer_enrollment`, `save_attendance`, `record_makeup`, `dashboard_summary`) để mở nhánh Giáo viên. **Không chạy lại file 03 sau file 05** (file 03 sẽ ghi đè các hàm đã nâng cấp). Chạy lại file 05 thì an toàn.
7. `06_v2_3_audit_log.sql` (V2-3): chạy sau file 05. Bảng `audit_log` (chỉ Quản lý đọc, chặn UPDATE/DELETE/TRUNCATE), 11 trigger (9 trigger ghi nhật ký tự động trên 8 bảng nghiệp vụ + 2 trigger bảo vệ nhật ký) và 3 RPC chỉ Quản lý (`vn_school_year_bounds`, `query_audit_logs`, `clear_audit_logs_before`). Chạy lại an toàn.
8. `07_v2_4_backup.sql` (V2-4): chạy sau file 06. RPC xuất dữ liệu `export_center_backup`, `export_monthly_attendance_report` (chỉ Quản lý). Chạy lại an toàn.
9. Tệp tiện ích tùy chọn (không nằm trong chuỗi chạy bắt buộc): `check_before_launch.sql` (chỉ đọc, danh sách kiểm tra an toàn) và `reset_mock_data.sql` (xóa toàn bộ dữ liệu thử; có khóa an toàn ở đầu file, phải xóa khối khóa mới chạy được).
10. Từ V2-5 trở đi: tạo migration mới đánh số tiếp (`08_...`), viết chạy lại được nhiều lần; không tạo lại các file `sliceN_migration.sql` cũ.

### 1.2. Chi tiết 8 bảng dữ liệu (`ON DELETE RESTRICT` cho các khóa ngoại nghiệp vụ)
- **`parents`**: `id`, `parent_code` (`PH0001`..., tự sinh, không đổi), `full_name`, `phone` (bắt buộc, 10 số bắt đầu bằng `0`, duy nhất), `created_at`, `deleted_at`.
- **`teachers`**: `id`, `full_name`, `phone` (duy nhất nếu có), `email`, `created_at`, `deleted_at`.
- **`students`**: `id`, `student_code` (`HS0001`..., tự sinh, không đổi), `full_name`, `phone` (duy nhất nếu có), `parent_id` (-> `parents`), `grade` (khối `1..12`, tự gán theo lớp khi ghi danh), `created_at`, `deleted_at`.
- **`classes`**: `id`, `name` (tự sinh `Môn_Khối_TênGV_STT`, duy nhất giữa các lớp đang hiển thị `uq_classes_name_active`), `subject`, `grade` (`1..12`), `class_no`, `teacher_id` (-> `teachers`), `price_per_session` (đơn giá hiện tại >= 0), `deleted_at`, `created_at`.
- **`class_schedules`**: `id`, `class_id` (-> `classes`), `day_of_week` (`2..8`), `start_time`, `end_time`, `created_at`. Duy nhất theo `(class_id, day_of_week)` — mỗi lớp mỗi ngày tối đa 1 ca.
- **`class_enrollments`**: `id`, `class_id`, `student_id`, `status` (`'active'` | `'dropped'`), `joined_at`, `left_at` (bắt buộc khi `'dropped'`), `created_at`. Mỗi học sinh chỉ có tối đa 1 dòng `'active'` trong cùng 1 lớp (`uq_enrollments_one_active`).
- **`attendance_records`**: `id`, `enrollment_id`, `class_id`, `student_id`, `attendance_date`, `status` (`'present'` | `'absent'` | `'absent_excused'`), `price_snapshot` (bắt buộc có với `present`/`absent`, `NULL` với `absent_excused`), `created_at`. Duy nhất theo `(class_id, student_id, attendance_date)`.
- **`profiles`**: `user_id` (PK -> `auth.users` on delete cascade), `role` (`'manager'` | `'teacher'`), `teacher_id` (duy nhất -> `teachers`, bắt buộc có nếu `role = 'teacher'`, `NULL` nếu `role = 'manager'`), `active` (boolean), `created_at`.

### 1.3. Các hàm RPC & Tiện ích Database đang có
- **Auth & Vai trò:**
  - `app_role()`: Trả về `'manager'` | `'teacher'` | `NULL`. Trả về `NULL` nếu chưa đăng nhập, `profiles.active = false`, giáo viên đã bị ẩn (`teachers.deleted_at IS NOT NULL`), hoặc phiên của giáo viên đã quá **48 giờ** kể từ `auth.users.last_sign_in_at`.
  - `is_manager()`, `current_teacher_id()`, `my_profile()`, `setup_initial_manager(p_email)` (chỉ chạy trong SQL Editor), `assert_manager()`.
- **Nghiệp vụ Lớp & Học sinh:**
  - `save_class(p_class_id, p_name, p_subject, p_grade, p_class_no, p_teacher_id, p_price, p_schedule jsonb, p_restore)`: Thêm/sửa lớp và ghi lại lịch học trong 1 giao dịch.
  - `register_student_in_class(p_class_id, p_joined_at, p_full_name, p_phone, p_parent_name, p_parent_phone)`: Tạo học sinh + gắn/tạo phụ huynh theo SĐT + ghi danh vào lớp.
  - `update_student(p_student_id, p_full_name, p_phone, p_parent_name, p_parent_phone)`: Cập nhật học sinh và xử lý thông minh liên kết phụ huynh (không làm đổi SĐT của anh chị em ruột nếu phụ huynh có nhiều con).
  - `drop_enrollment(p_enrollment_id, p_left_at, p_delete_attendance)`: Cho nghỉ học (xóa mềm), kiểm tra/xóa điểm danh sau ngày nghỉ; gọi hàm lõi `_drop_enrollment_core`.
  - `transfer_enrollment(p_enrollment_id, p_new_class_id, p_date, p_delete_attendance)`: Đổi lớp trong 1 giao dịch (vào lớp mới trước, nghỉ lớp cũ sau qua `_drop_enrollment_core`; `left_at` cũ = `joined_at` mới = `p_date`).
- **Điểm danh & Học bù:**
  - `save_attendance(p_class_id, p_date, p_items jsonb)`: Lưu/sửa/xóa điểm danh cả buổi. Đổi `present` <-> `absent` giữ nguyên giá cũ; từ `absent_excused` sang tính tiền lấy giá hiện tại của lớp; `status = null` thì xóa bản ghi.
  - `record_makeup(p_makeup_class_id, p_date, p_enrollment_id, p_original_date)`: Ghi học bù giữa 2 lớp cùng giáo viên (không bắt buộc cùng khối). Tạo bản ghi `present` ở lớp bù với `enrollment_id` của lớp gốc và đơn giá của lớp gốc; chuyển buổi gốc thành `absent_excused`.
- **Dashboard & Thống kê:**
  - `student_presence_spans()`: Gộp các đợt học nối tiếp hoặc cách nhau tối đa 1 ngày (đổi lớp) thành khoảng hiện diện liên tục tại Trung tâm. Chỉ trả dữ liệu cho Quản lý.
  - `dashboard_summary(p_year, p_month)`: Quản lý nhận JSON 6 chỉ số thống kê và doanh thu tháng. Giáo viên nhận nhánh riêng cùng khóa JSON: `class_count` (lớp đang hiển thị, hiện tại), `student_count` (học sinh `'active'` không trùng, hiện tại), `revenue` và `charged_sessions` (theo tháng đã chọn, chỉ lớp mình); không dùng `student_presence_spans()`.
  - `dashboard_schedule(p_date)`: Chỉ Quản lý. Trả về danh sách lớp có lịch học trong ngày kèm sĩ số (`total_count` gồm cả học bù) và số học sinh đã điểm danh (`marked_count`).
- **Hàm của V2-2 (`05_v2_2_teacher_access.sql`):**
  - Trợ giúp RLS (`SECURITY DEFINER`, tránh đệ quy RLS giữa các bảng): `teacher_owns_class`, `teacher_owns_enrollment`, `teacher_sees_enrollment`, `teacher_sees_student`, `teacher_sees_parent`.
  - `assert_staff()`: chốt chặn cho RPC mở cho cả Quản lý và Giáo viên, trả về vai trò.
  - `link_teacher_account(p_email, p_teacher_id)`, `set_teacher_account_active(p_teacher_id, p_active)`: chỉ Quản lý.
  - `lookup_parent_by_phone(p_phone)`: tra cứu phụ huynh và các con, chỉ khớp chính xác 10 số, trả `NULL` nếu không khớp.
  - `enroll_existing_student(p_class_id, p_student_id, p_joined_at)`: ghi danh học sinh đã có (thay cho INSERT trực tiếp từ trình duyệt).
  - `set_class_hidden(p_class_id, p_hidden, p_new_name, p_new_class_no)`: ẩn/khôi phục lớp (Giáo viên chỉ với lớp mình).

- **Hàm của V2-3 (`06_v2_3_audit_log.sql`) và V2-4 (`07_v2_4_backup.sql`):**
  - `vn_school_year_bounds(p_start_year)`: khoảng Năm học 15/06 -> 12/06 năm sau.
  - `query_audit_logs(p_from_date, p_to_date, p_actor_role, p_teacher_id, p_action_group, p_class_id, p_student_id, p_search, p_limit, p_offset)`: chỉ Quản lý; trả `{total, limit, offset, school_year, items}`.
  - `clear_audit_logs_before(p_before_date, p_expected_count, p_confirm_text)`: chỉ Quản lý; ngoại lệ có kiểm soát duy nhất để xóa nhật ký (xem 2.4).
  - `export_center_backup(p_include_audit_log, p_tables)` và `export_monthly_attendance_report(p_year, p_month)`: chỉ Quản lý; mỗi lần xuất ghi 1 dòng nhật ký `backup_export`.
  - Hàm nội bộ (đã thu quyền EXECUTE): `_write_audit_log`, `_guard_audit_log_immutable`, `_guard_audit_log_truncate`, `_fmt_vnd`, `_attendance_status_label`, `_attendance_payload`, `_schedule_snap_label` và các hàm trigger `_trg_audit_*`.

---

## 2. Quy tắc Nghiệp vụ Cốt lõi (Đã chốt)

### 2.1. Quy tắc Ẩn / Hiện & Khối lớp
- **Học sinh bắt buộc thuộc ít nhất 1 lớp đang học:** Khi nghỉ lớp cuối cùng, học sinh tự động ẩn (`deleted_at = now()`); khi được ghi danh vào lớp mới, học sinh tự hiện lại. Trang Học sinh không có nút "Khôi phục" riêng.
- **Phụ huynh tự đồng bộ theo con:** Tự ẩn khi tất cả các con đều ẩn; tự hiện lại khi có ít nhất 1 con hiển thị.
- **Giáo viên & Lớp học:** Chỉ ẩn được Giáo viên khi không còn lớp chưa ẩn; chỉ ẩn được Lớp khi không còn học sinh `'active'`. Khi ẩn Giáo viên, tài khoản `profiles.active` tự động chuyển thành `false` (khôi phục Giáo viên không tự mở lại tài khoản).
- **Cùng khối:** Mỗi học sinh chỉ được ghi danh vào các lớp **cùng khối** (Trigger chặn cứng ở DB). Muốn lên khối mới: cho nghỉ hết các lớp khối cũ rồi đăng ký lớp ở khối mới. Ngoại lệ duy nhất: **Học bù** chỉ yêu cầu cùng giáo viên, không bắt buộc cùng khối.

### 2.2. Quy tắc Phân quyền V2 (Quản lý vs Giáo viên)
- **Quản lý (`manager`):** Toàn quyền trên mọi bảng và mọi hàm RPC.
- **Giáo viên (`teacher`)** (chốt ở V2-2). Giáo viên chỉ có quyền `SELECT` qua RLS; mọi thao tác ghi đi qua RPC `SECURITY DEFINER` tự kiểm tra vai trò, phạm vi lớp và tháng hiện tại:
  - Phiên đăng nhập tối đa **48 giờ** kể từ `last_sign_in_at`. Dùng chung `LoginPage`, vào thẳng trang **Lớp học**.
  - **Không** thấy Tổng quan (`DashboardPage`) và Quản lý Giáo viên (`TeachersPage`); menu chỉ có Lớp học, Học sinh, Tài khoản. Thống kê riêng (Lớp đang phụ trách, Tổng số học sinh đang dạy, Doanh thu tháng) nằm ở đầu trang Lớp học, lấy từ `dashboard_summary` (nhánh Giáo viên, chỉ tính các lớp của mình).
  - Chỉ thấy lớp mình phụ trách (`classes.teacher_id = current_teacher_id()`), học sinh thuộc lớp mình (kể cả em đã nghỉ khỏi lớp mình, để giữ lịch sử) và phụ huynh của các em đó. Không thấy lớp, học sinh hay doanh thu của giáo viên khác.
  - **Lớp học:** tạo lớp mới cho chính mình, sửa thông tin/lịch/đơn giá lớp mình, ẩn lớp (khi không còn học sinh `'active'`) và khôi phục lớp mình (qua `set_class_hidden`). **Không** chuyển lớp cho giáo viên khác; chỉ Quản lý đổi được `teacher_id`.
  - **Học sinh:** thêm học sinh vào lớp mình (`register_student_in_class`, `enroll_existing_student`) với ngày vào lớp trong tháng hiện tại; sửa học sinh đang học lớp mình (`update_student`).
  - **Phụ huynh:** Giáo viên **không được đổi tên phụ huynh**. Nhập SĐT phụ huynh trước (`lookup_parent_by_phone`, chỉ khớp chính xác 10 số): trùng bản ghi có sẵn thì tên bị khóa và hiện danh sách con để chọn, không có em đó thì thêm học sinh mới của phụ huynh đó. Khi sửa học sinh, đổi sang SĐT chưa có: nếu phụ huynh hiện tại chỉ có đúng 1 con thì chỉ đổi SĐT (giữ tên), ngược lại tạo phụ huynh mới.
  - **Cho nghỉ (`drop_enrollment`):** ở lớp mình, ngày nghỉ trong tháng hiện tại. **Đổi lớp (`transfer_enrollment`):** giữa 2 lớp cùng khối, cùng môn, cùng do mình dạy, ngày chuyển trong tháng hiện tại.
  - **Điểm danh (`save_attendance`)** và **Học bù (`record_makeup`, giữa 2 lớp của mình):** CHỈ TRONG THÁNG HIỆN TẠI (`vn_month_start()`). Dữ liệu tháng trước chỉ Quản lý sửa được.
  - Khi Quản lý đổi giáo viên của một lớp, toàn bộ lịch sử điểm danh và doanh thu của lớp đó chuyển theo sang giáo viên mới (điểm danh không lưu giáo viên).
- **Quản lý tài khoản Giáo viên (chỉ Quản lý):** tạo user trong Supabase Authentication rồi liên kết bằng email qua `link_teacher_account`; khóa/mở khóa bằng `set_teacher_account_active`. Trang Giáo viên hiện nhãn `Chưa cấp tài khoản` / `Đang hoạt động` / `Đã khóa`.

### 2.3. Nhật ký thay đổi (`audit_log`, V2-3)
- **Ghi tự động bằng trigger** (không cần frontend gọi): mọi thao tác dù do Quản lý hay Giáo viên (qua RPC `SECURITY DEFINER`) đều được ghi kèm `auth.uid()`, vai trò (`manager` | `teacher` | `system`), `actor_teacher_id` nếu là Giáo viên và tên người thực hiện.
- **Các nhóm bộ lọc (loại thao tác):** Điểm danh (tạo/sửa/xóa), Học bù, Ghi danh · Cho nghỉ · Đổi lớp, Lớp học (tạo/sửa/ẩn/khôi phục/đổi lịch học), Học sinh & Phụ huynh (tạo/sửa/tự ẩn/tự hiện/sửa phụ huynh), Giáo viên & Tài khoản (thêm/sửa/ẩn/khôi phục/liên kết/gỡ tài khoản cũ/khóa/mở khóa), Hệ thống (xuất sao lưu, làm mới nhật ký).
- **Ghi từng dòng, gộp khi hiển thị:** mỗi dòng điểm danh là 1 dòng nhật ký; cột `batch_id` (mã giao dịch) giúp giao diện gộp các dòng của cùng một lần bấm. `price_snapshot` được ghi đúng giá trị đóng băng cũ/mới, không tính lại theo `classes.price_per_session`.
- **Đổi lớp** tạo 2 dòng (Ghi danh lớp mới + Đổi lớp); giao diện ẩn dòng Ghi danh thừa của cùng học sinh trong cùng giao dịch.
- **Bảo vệ toàn vẹn:** RLS chỉ cho Quản lý `SELECT`; `authenticated` bị thu `INSERT/UPDATE/DELETE/TRUNCATE`; trigger chặn UPDATE/DELETE/TRUNCATE (thông báo "Nhật ký thay đổi được bảo vệ toàn vẹn..." chỉ hiện khi chạy trong SQL Editor; từ trình duyệt sẽ báo thiếu quyền trước).

### 2.4. Chu kỳ Năm học & Làm mới nhật ký (V2-3/V2-4)
- **Năm học của Trung tâm:** 15/06 năm nay -> 12/06 năm sau (`vn_school_year_bounds`, `getCurrentSchoolYearBounds`).
- **Xóa nhật ký là ngoại lệ có kiểm soát duy nhất** (không hard delete dữ liệu nghiệp vụ): chỉ Quản lý; `clear_audit_logs_before` yêu cầu cụm xác nhận `XOA NHAT KY`, ngày chốt phải là ngày đã qua, và `p_expected_count` phải khớp đúng số dòng sắp xóa (số dòng đã nằm trong file sao lưu vừa tải). Sau khi xóa tự ghi 1 dòng `audit_log_clear`.
- **Sao lưu thủ công (gói Supabase Free):** Quản lý tải JSON toàn hệ thống và CSV (Học sinh & Phụ huynh, Lớp học & Lịch học, Điểm danh & Học phí theo tháng) từ nút **Sao lưu & Năm học** trên Tổng quan. CSV có BOM UTF-8, SĐT dạng `="0912..."` để Excel giữ số 0 đầu, ô văn bản bắt đầu bằng `= + - @` được thêm tiền tố `'` chống chèn công thức.

---

## 3. Cây thư mục Frontend hiện tại (`src/`)
- **`src/App.jsx`**: Cổng đăng nhập, kiểm tra `my_profile()`, xử lý `PASSWORD_RECOVERY`, hẹn giờ tự đăng xuất khi hết phiên 48h của giáo viên, giữ state điều hướng trang và lối tắt nhảy tới màn hình Điểm danh.
- **`src/lib/`**:
  - `supabaseClient.js`: Khởi tạo kết nối Supabase.
  - `errors.js`: Dịch lỗi Database/Auth sang tiếng Việt.
  - `format.js`, `text.js`, `validators.js`, `subjects.js`, `grade.js`, `schedule.js`, `className.js`, `voice.js`, `tuition.js`, `dashboard.js`, `transfer.js`.
- **`src/components/`**:
  - Dùng chung: `PageShell.jsx`, `ConnectionStatus.jsx`, `Modal.jsx`, `ConfirmDialog.jsx`, `FormField.jsx`, `SelectField.jsx`, `EmptyState.jsx`, `Notice.jsx`, `RowActions.jsx`.
  - `layout/`: `AppLayout.jsx`, `Sidebar.jsx`, `BottomNav.jsx`, `navItems.js`.
  - `auth/`: `ChangePasswordModal.jsx`.
  - `dashboard/`: `StatCard.jsx`, `TodaySchedule.jsx`.
  - `classes/`: `ClassForm.jsx`, `ClassRoster.jsx`, `ClassAttendance.jsx`, `MakeupModal.jsx`, `EnrollStudentModal.jsx`, `DropEnrollmentDialog.jsx`, `ChangeTeacherDialog.jsx`, `RegisterStudentFlow.jsx`.
  - `students/`: `StudentProfile.jsx`, `TransferClassModal.jsx`, `AddClassModal.jsx`, `ClassPickList.jsx`.
  - `teachers/`: `TeacherProfile.jsx`, `TeacherAccountPanel.jsx` (liên kết/khóa tài khoản), `AccountBadge.jsx`.
  - `classes/` có thêm `TeacherStatsBar.jsx` (thống kê riêng của Giáo viên ở đầu trang Lớp học). `lib/` có thêm `teacherAccount.js`.
  - V2-3/V2-4: `audit/AuditLogModal.jsx` (tra cứu nhật ký, lọc, gộp theo `batch_id`, "Xem thêm"), `backup/BackupModal.jsx` (sao lưu, xuất CSV, kết thúc Năm học); `lib/auditLog.js` (nhãn thao tác, định dạng, gọi RPC), `lib/backup.js` (JSON/CSV). Ở thư mục gốc có `vercel.json` (SPA routing + Security Headers + CSP chế độ Report-Only).
- **`src/pages/`**: `LoginPage.jsx`, `DashboardPage.jsx`, `ClassesPage.jsx`, `StudentsPage.jsx`, `TeachersPage.jsx`.
---

## 4. Đặc tả Chi tiết Giao diện & Luồng thao tác từng Màn hình (UI Blueprint)

### 4.1. Khung bố cục chung (`AppLayout`, `Sidebar`, `BottomNav`)
- **Tông màu & Bố cục:** Nền xám sáng (`bg-slate-50`), thẻ trắng viền mảnh (`border-slate-200`), màu nhấn xanh dương (`blue-600`). Trên máy tính có `Sidebar` bên trái; trên điện thoại có thanh `BottomNav` cố định ở đáy. Quản lý thấy 5 mục (Tổng quan, Lớp học, Học sinh, Giáo viên, Tài khoản); Giáo viên thấy 3 mục (Lớp học, Học sinh, Tài khoản). Danh sách menu lọc theo vai trò qua `navItemsFor(role)` trong `navItems.js`.
- **Trạng thái kết nối (`ConnectionStatus`):** Kiểm tra kết nối Supabase, không báo lỗi giả khi người dùng chưa đăng nhập.
- **Tương tác danh sách chuẩn:**
  - Mọi danh sách chính đều hiển thị dạng **Bảng (`<table>`) trên màn hình `md:` trở lên** và tự chuyển thành **Thẻ (`Card`) trên điện thoại**.
  - Tên Học sinh, tên Giáo viên và tên Lớp học là **nút bấm chữ xanh** để mở màn hình Chi tiết / Hồ sơ ngay trong trang đó (dùng state `openedId`, có nút "Quay lại" giữ nguyên bộ lọc và từ khóa tìm kiếm trước đó).

### 4.2. Màn hình Tổng quan (`DashboardPage.jsx`)
- **Hai nút đầu trang (chỉ Quản lý):** **Nhật ký thay đổi** (mở `AuditLogModal`) và **Sao lưu & Năm học** (mở `BackupModal`). Nút **Lịch sử lớp** (`ClassRoster`) và **Lịch sử thay đổi** (`StudentProfile`) chỉ hiện khi không phải Giáo viên và mở nhật ký đã lọc sẵn theo lớp/học sinh đang xem.
- **Bộ lọc Tháng/Năm:** Nút chuyển Tháng trước / Tháng sau (khóa nút Tháng sau khi đang ở tháng hiện tại).
- **6 Thẻ thống kê (`StatCard`):** Số lớp đang hoạt động, Số giáo viên, Tổng học sinh đang học (không trùng), Học sinh mới trong tháng, Học sinh xin nghỉ hẳn trong tháng, và Doanh thu dự kiến trong tháng (chỉ cộng `price_snapshot` các buổi đã điểm danh Có mặt + Vắng, kèm tổng số buổi tính phí).
- **Lịch học trong ngày (`TodaySchedule`):**
  - Có nút chọn nhanh **Hôm qua / Hôm nay / Ngày mai** và ô chọn ngày bất kỳ.
  - Mỗi dòng lớp hiển thị: Khung giờ (`start_time - end_time`), Tên lớp, Môn/Khối, Giáo viên phụ trách, và trạng thái điểm danh (`marked_count / total_count` — Đã điểm danh đủ / Đang điểm danh / Chưa điểm danh).
  - **Lối tắt vận hành:** Bấm vào bất kỳ dòng lớp học nào trong lịch sẽ nhảy thẳng sang màn hình **Điểm danh** của đúng lớp đó và đúng ngày đang xem.

### 4.3. Màn hình Quản lý Lớp học & Điểm danh (`ClassesPage`, `ClassRoster`, `ClassAttendance`)
- **Danh sách Lớp học (`ClassesPage`):**
  - Mặc định lọc các lớp **có lịch học HÔM NAY**; có công tắc *"Hiện tất cả lớp"*, công tắc *"Hiện cả lớp đã ẩn"*, bộ lọc theo Ngày trong tuần, Khối (`1..12`), Môn học và ô tìm kiếm.
  - Trên mỗi dòng lớp có nút lối tắt **"Điểm danh"** (mở thẳng tab Điểm danh) và menu thao tác Sửa / Ẩn / Khôi phục.
- **Form Thêm/Sửa Lớp (`ClassForm`):**
  - Chọn Môn (từ danh sách cố định), Khối (`1..12`), Giáo viên phụ trách, Số thứ tự lớp (`class_no` tự gợi ý số nhỏ nhất còn trống) -> **Tên lớp tự động sinh** theo công thức `Môn_Khối_TênGV_STT` (ví dụ: `VatLi_12_Nam_1`), không gõ tay.
  - Cấu hình lịch học: Tích chọn các thứ trong tuần (`Thứ 2 .. Chủ nhật`), mỗi thứ được chọn có ô nhập `Giờ bắt đầu` và `Giờ kết thúc` riêng.
- **Chi tiết Lớp học (`ClassRoster`):** Có 2 tab chuyển đổi là **Học sinh** và **Điểm danh**:
  - **Tab Học sinh:** Hiển thị danh sách học sinh đang học (`active`) và mục học sinh đã nghỉ (`dropped`) sắp theo TÊN gọi. Có nút **"Thêm học sinh"** (`EnrollStudentModal` gồm 2 tab: *Theo SĐT phụ huynh* để tìm con cũ / thêm anh chị em ruột giữ nguyên `parent_code`, hoặc *Tìm học sinh* theo tên/mã/SĐT) và nút **"Cho nghỉ"** (`DropEnrollmentDialog` chọn ngày nghỉ, cảnh báo nếu có điểm danh sau ngày nghỉ).
  - **Tab Điểm danh (`ClassAttendance`):**
    - Chọn ngày điểm danh (có nút chuyển nhanh giữa các ngày có lịch học của lớp).
    - Thanh công cụ hàng loạt: **"Tất cả có mặt"**, **"Nghỉ (cả lớp có phép)"** (chỉ áp dụng cho các em chưa chấm trạng thái), nút **"Điểm danh giọng nói"** (Web Speech API `vi-VN`, đọc tên học sinh và hiện hộp xác nhận) và nút **"+ Học bù"** (`MakeupModal`: chọn học sinh từ lớp khác của cùng giáo viên và chọn buổi nghỉ gốc để bù).
    - Mỗi dòng học sinh có 3 nút trạng thái rõ ràng: Có mặt (present), Vắng (absent - vẫn tính tiền), Có phép (absent_excused - không tính tiền) và nút xóa trạng thái nếu bấm nhầm. Khi bấm từng nút hoặc công cụ hàng loạt, hệ thống tự động gọi save_attendance và cập nhật giao diện tức thì (Optimistic UI), không cần bấm nút Lưu riêng..

### 4.4. Màn hình Học sinh & Hồ sơ Đa môn (`StudentsPage`, `StudentProfile`)
- **Danh sách Học sinh (`StudentsPage`):**
  - Tìm kiếm không dấu theo tên, mã `HS...`, SĐT học sinh hoặc SĐT phụ huynh. Bộ lọc theo Khối và Môn học. Công tắc *"Hiện cả học sinh đã ẩn"*.
  - Nút **"Đăng ký học sinh mới"** (`RegisterStudentFlow`): bắt buộc chọn lớp đầu tiên, nhập thông tin học sinh và SĐT/họ tên phụ huynh.
- **Hồ sơ Chi tiết Học sinh (`StudentProfile`):**
  - Thông tin cá nhân, Mã HS, Khối hiện tại, Họ tên & SĐT Phụ huynh (kèm mã `PH...`).
  - Mục **Các lớp đang học**: Hiển thị thẻ từng lớp kèm Giáo viên, Lịch học, Đơn giá. Trên đầu mục có nút **"+ Đăng ký thêm lớp"** (`AddClassModal` - chỉ cho chọn lớp cùng khối); trên mỗi thẻ lớp có nút 'Đổi lớp' (TransferClassModal - chọn lớp mới cùng khối và ngày chuyển); thao tác 'Cho nghỉ' (DropEnrollmentDialog) được thực hiện tại màn hình Chi tiết Lớp học (ClassRoster).
  - Mục **Học phí & Lịch sử điểm danh theo tháng**: Có bộ chọn Tháng/Năm. Hiển thị Tổng học phí tính đến hiện tại (cộng dồn `price_snapshot` từ mọi lớp trong tháng), số buổi đã học / vắng / có phép / số buổi còn lại theo lịch, và danh sách ngày điểm danh chi tiết (buổi học bù được gom về lớp gốc kèm nhãn *"Học bù tại lớp X"*).

### 4.5. Màn hình Giáo viên & Hồ sơ Giáo viên (`TeachersPage`, `TeacherProfile`)
- Chỉ Quản lý truy cập. Danh sách giáo viên (tìm kiếm, Thêm/Sửa/Ẩn/Khôi phục, công tắc hiện mục đã ẩn) kèm nhãn trạng thái tài khoản (`Chưa cấp tài khoản` / `Đang hoạt động` / `Đã khóa`).
- **Hồ sơ Giáo viên (`TeacherProfile`):** Có khu vực **Tài khoản đăng nhập** với nút "Liên kết tài khoản đăng nhập" (nhập email đã tạo trong Supabase Authentication) và "Khóa / Mở khóa tài khoản". Hiển thị thông tin liên hệ, tổng số học sinh đang dạy (đếm không trùng), và danh sách các lớp đang phụ trách kèm lịch học, đơn giá, sĩ số từng lớp (không hiển thị lương hay doanh thu).