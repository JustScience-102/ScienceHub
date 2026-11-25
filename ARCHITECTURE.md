# Kiến trúc & Nghiệp vụ Hệ thống ScienceHub (V3)

Web quản lý Trung tâm: lớp học, học sinh, phụ huynh, giáo viên, điểm danh và học phí theo tháng. React (Vite) + Tailwind
trên Vercel, nối thẳng Supabase (PostgreSQL, Auth, RLS, RPC). Khi file này và mã nguồn lệch nhau, **mã nguồn đúng**:
chú thích đầu mỗi file `supabase/v3/*.sql` và đầu mỗi hàm ghi quy tắc chi tiết.

---

## 1. Database (bộ `supabase/v3/`)

### 1.1. Các file và cách chạy
Mỗi file chạy lại nhiều lần vẫn an toàn; mỗi hàm chỉ định nghĩa ở **một** file. Sửa SQL: chạy lại file đã sửa trong
Supabase SQL Editor rồi chạy lại `09_grants.sql`.

| File | Nội dung |
|---|---|
| `00_meta.sql` | Thu quyền mặc định Supabase cấp cho `anon`/`authenticated`; `schema_migrations`; hàm giờ Việt Nam (`vn_today`, `vn_month_start`, `vn_day_of_week`); cờ `_is_restoring`. |
| `01_tables.sql` | 14 bảng (mục 1.2), ràng buộc, chỉ mục; bật RLS mọi bảng. |
| `02_security.sql` | Vai trò (`app_role`, `is_manager`, `current_teacher_id`, `assert_manager`, `assert_staff`, `my_profile`, `setup_initial_manager`), phạm vi Giáo viên (`my_class_ids`, `my_owned_enrollment_ids`, `my_visible_enrollment_ids`, `my_student_ids`, `my_parent_ids`), policy RLS, hàm ghi nhật ký `_write_audit_log`. |
| `03_naming.sql` | Tên lớp do Database sinh (`class_name_for`, `preview_class_name`, `_refresh_class_names`), view `class_versions_labeled`, `class_label_on`, so trùng họ tên `_norm_name`. |
| `04_integrity.sql` | Trigger toàn vẹn (mục 1.5); trạng thái suy ra tính lại bằng `_sync_student_state` / `_sync_parent_state`. |
| `05_rpc_core.sql` | RPC lớp, học sinh, ghi danh, điểm danh, học bù, thống kê. |
| `06_rpc_admin.sql` | RPC giáo viên, tài khoản, khóa sổ tháng, nhóm lớp. |
| `07_audit.sql` | Trigger nhật ký, `query_audit_logs`, `clear_audit_logs_before`, `vn_school_year_bounds`. |
| `08_ops.sql` | Sao lưu, báo cáo tháng, nhập CSV, chuyển năm học, khôi phục. |
| `09_grants.sql` | Cấp quyền (chạy cuối, chạy lại sau mỗi lần sửa SQL). |
| `10_sciencehub.sql` | Nối app giao bài ScienceApp (mục 2.14). Chạy sau `09`, rồi chạy lại `09`. |
| `11_website.sql` | Trang giới thiệu sciencehub.id.vn (mục 5.2). Chạy sau `website_link.sql` (tạo tài khoản, một lần), rồi chạy lại `09`. |
| `bootstrap_manager.sql` | Tạo Quản lý đầu tiên (sửa email rồi chạy trong SQL Editor). |
| `check_v3.sql` | Truy vấn chỉ đọc để đối chiếu cài đặt và quyền. |

Bộ test `supabase/tests/*.test.mjs` chạy toàn bộ SQL trên PGlite (`npm run test:db`), giả lập `auth` và vai trò của Supabase;
mỗi lời gọi của người dùng là một giao dịch như PostgREST.

### 1.2. Bảng dữ liệu
Khóa ngoại nghiệp vụ `ON DELETE RESTRICT`. Không xóa cứng dữ liệu nghiệp vụ (xem `RULES.md`).
- **`parents`**: `parent_code` (`PH0001`…, tự sinh, không đổi), `full_name`, `phone` (bắt buộc, 10 số bắt đầu `0`, duy nhất), `deleted_at` (hệ thống tự đặt theo các con).
- **`teachers`**: `full_name`, `phone` (duy nhất nếu có), `email`, `deleted_at`.
- **`students`**: `student_code` (`HS0001`…), `full_name`, `phone` (duy nhất nếu có), `parent_id`, `grade` và `deleted_at` (tự tính từ các lớp đang học).
- **`classes`**: `name` (Database sinh, mục 2.3), `subject`, `grade` (1–12), `class_no`, `teacher_id` (đều bắt buộc), `price_per_session` (đơn giá hiện tại), `deleted_at`. Mỗi bộ (môn, khối, giáo viên, STT) chỉ một lớp đang hiển thị (`uq_classes_slot_active`).
- **`class_schedules`**: `class_id`, `day_of_week` (2 = Thứ 2 … 7 = Thứ 7, 8 = Chủ nhật), `start_time`, `end_time`, `valid_from`, `valid_to` (thời kỳ; `valid_to` NULL = lịch hiện hành). Mỗi lớp mỗi thứ tối đa 1 ca trong một thời kỳ.
- **`class_enrollments`**: `class_id`, `student_id`, `status` (`active` | `dropped`), `joined_at`, `left_at`, `left_reason` (`dropped` nghỉ hẳn | `transferred` đổi lớp, kèm `transfer_to_id` | `graduated` hoàn thành lớp cuối cấp). Mỗi học sinh tối đa 1 dòng `active` trong một lớp.
- **`attendance_records`**: `enrollment_id`, `class_id`, `student_id`, `attendance_date`, `status` (`present` | `absent` | `absent_excused`), `price_snapshot` (bắt buộc khi tính tiền, NULL khi Có phép), `makeup_of_date`, `makeup_prev_status`, `makeup_prev_price` (học bù, mục 2.5). Duy nhất theo (lớp, học sinh, ngày); mỗi buổi gốc chỉ bù 1 lần (`uq_attendance_makeup_once`).
- **`profiles`**: `user_id` (→ `auth.users`), `role` (`manager` | `teacher`), `teacher_id` (duy nhất, bắt buộc với Giáo viên), `active`.
- **`class_versions`**: thời kỳ ĐÃ ĐÓNG của cấu trúc lớp (môn, khối, STT, giáo viên, giá tham khảo, `valid_from`, `valid_to`, `reason` = `edit` | `year_rollover`). Chỉ thêm, không sửa/xóa. Tên lớp và tên giáo viên của lịch sử tính lại khi đọc qua view `class_versions_labeled`.
- **`month_closures`**: mỗi dòng là một tháng đã chốt sổ (`month_start`, người và lúc chốt).
- **`class_groups`**, **`class_group_members`** (`class_id` khóa chính, `group_id`, `part_no`): nhóm lớp (mục 2.7).
- **`audit_log`**: nhật ký thay đổi (mục 2.9), không khóa ngoại.
- **`restore_staging`**: bảng tạm chứa file sao lưu đang tải lên; chỉ RPC đọc/ghi, tự dọn sau 1 ngày.

### 1.3. Bảo mật & phân quyền
- `anon` không có quyền gì trên schema `public`. `authenticated` **chỉ có SELECT** (RLS lọc dòng); mọi thao tác ghi, **kể cả của Quản lý**, đi qua RPC `SECURITY DEFINER` + `search_path` cố định, tự kiểm vai trò ở đầu hàm (`assert_manager()` hoặc `assert_staff()`).
- Quyền chỉ cấp ở `09_grants.sql`: `authenticated` gọi được mọi hàm tên **không** bắt đầu bằng `_` (trừ `setup_initial_manager`, chỉ chạy trong SQL Editor). Hàm `_...` là hàm nội bộ.
- `app_role()` trả `manager` | `teacher` | NULL. NULL khi chưa đăng nhập, `profiles.active = false`, giáo viên đã bị ẩn, hoặc **phiên Giáo viên quá 48 giờ** kể từ lần đăng nhập gần nhất. `my_profile()` trả `status` (`ok` | `no_profile` | `inactive` | `teacher_hidden` | `expired`) cho giao diện.
- Phạm vi Giáo viên tính một lần mỗi truy vấn qua các hàm `my_*_ids()` (mảng uuid): lớp mình dạy; ghi danh thuộc lớp mình hoặc có buổi học bù tại lớp mình; học sinh có ghi danh (mọi trạng thái) hoặc điểm danh tại lớp mình; phụ huynh của các em đó.

### 1.4. RPC theo nhóm
- **Lớp:** `save_class` (thêm/sửa lớp + lịch; lịch mới áp dụng từ `p_schedule_from`), `set_class_hidden` (ẩn/khôi phục; Quản lý đổi được giáo viên khi khôi phục), `preview_class_name`.
- **Học sinh & ghi danh:** `register_student_in_class`, `update_student`, `lookup_parent_by_phone`, `enroll_existing_student`, `drop_enrollment`, `transfer_enrollment` (hai hàm sau dùng lõi `_drop_enrollment_core`).
- **Điểm danh & học bù:** `save_attendance` (trả lại toàn bộ bản ghi của buổi), `record_makeup`, `cancel_makeup`.
- **Thống kê:** `dashboard_summary(p_year, p_month)` (Quản lý: 6 chỉ số + doanh thu; Giáo viên: số lớp, số học sinh hiện tại và doanh thu tháng của lớp mình), `dashboard_schedule(p_date)` (chỉ Quản lý).
- **Quản trị (chỉ Quản lý):** `save_teacher`, `set_teacher_hidden`, `link_teacher_account`, `set_teacher_account_active`, `close_month`, `reopen_month`, `save_class_group`, `delete_class_group`; `class_groups_overview` (Giáo viên xem được nhóm mà mọi lớp đều do mình dạy).
- **Nhật ký (chỉ Quản lý):** `query_audit_logs`, `clear_audit_logs_before`, `vn_school_year_bounds`.
- **Vận hành (chỉ Quản lý):** `export_center_backup`, `export_monthly_attendance_report`, `import_students_bulk`, `rollover_school_year`, `restore_stage_chunk`, `restore_stage_abort`, `restore_center_backup`.
- **App giao bài:** `student_homework_history(p_student_id)` (Quản lý: mọi học sinh; Giáo viên: học sinh lớp mình); `sciencehub.roster()` chỉ tài khoản `sciencehub_link` gọi được.
- Các RPC có bước xem trước (`import_students_bulk`, `rollover_school_year`, `restore_center_backup`) nhận `p_dry_run`: xem trước **chạy thật rồi hoàn tác**, nên kết quả xem trước luôn khớp lần chạy thật.

### 1.5. Trigger
- **Toàn vẹn (`04`)**: mã HS/PH không đổi; chỉ ẩn được giáo viên khi không còn lớp đang hiển thị (ẩn thì tài khoản tự khóa); chỉ ẩn được lớp khi không còn học sinh đang học; khối của học sinh đồng bộ theo lớp; kiểm tra **cùng khối** và **nhóm lớp** hoãn tới lúc COMMIT (nên "Đổi lớp" trong một giao dịch không bị chặn nhầm); lịch học không chồng thời kỳ; `class_versions` tự lưu nhãn cũ và không sửa/xóa được; chặn ghi điểm danh vào tháng đã chốt sổ. Khi đang khôi phục (`_is_restoring`) các trigger kiểm tra bỏ qua.
- **Nhật ký (`07`)**: tự ghi thay đổi trên `attendance_records`, `class_enrollments`, `classes`, `students`, `parents`, `teachers`, `profiles`; bảo vệ `audit_log` khỏi sửa/xóa.

---

## 2. Quy tắc nghiệp vụ (đã chốt)

### 2.1. Ẩn / hiện & khối
- Học sinh phải thuộc ít nhất 1 lớp đang học: nghỉ lớp cuối cùng thì tự ẩn, được ghi danh lại thì tự hiện. Không có nút "Xóa học sinh".
- Phụ huynh tự ẩn khi mọi con đều ẩn, tự hiện khi có con hiện lại.
- Học sinh chỉ học các lớp **cùng khối** (chặn cứng). Lên khối lẻ (lưu ban, đổi hướng): cho nghỉ hết lớp khối cũ rồi đăng ký lớp khối mới. Ngoại lệ: học bù (chỉ cần cùng giáo viên) và chuyển năm học (mục 2.11).

### 2.2. Quản lý và Giáo viên
- **Quản lý:** toàn quyền, nhưng vẫn ghi qua RPC.
- **Giáo viên** (vào thẳng trang Lớp học; không có Tổng quan, Quản lý Giáo viên, Nhật ký, Sao lưu):
  - Chỉ thấy lớp mình, học sinh của lớp mình (kể cả em đã nghỉ, để giữ lịch sử) và phụ huynh các em.
  - Tạo lớp cho chính mình, sửa lớp/lịch/đơn giá lớp mình, ẩn/khôi phục lớp mình; **không** chuyển lớp cho giáo viên khác.
  - Mọi thao tác có ngày (ghi danh, cho nghỉ, đổi lớp, điểm danh, học bù, hủy học bù, áp dụng lịch mới) chỉ với ngày **trong tháng hiện tại**; tháng trước chỉ xem.
  - Đổi lớp chỉ giữa hai lớp cùng khối, cùng môn, cùng do mình dạy.
  - **Không đổi tên phụ huynh.** Tra phụ huynh theo SĐT qua `lookup_parent_by_phone` (chỉ khớp đúng 10 số). Sửa học sinh sang SĐT phụ huynh chưa có: phụ huynh hiện tại chỉ có 1 con thì chỉ đổi SĐT (giữ tên), ngược lại tạo phụ huynh mới.
  - Đổi giáo viên của lớp (Quản lý làm) thì lịch sử điểm danh và doanh thu của lớp theo sang giáo viên mới.
- **Tài khoản Giáo viên:** tạo user trong Supabase Authentication rồi liên kết bằng email ở hồ sơ giáo viên (`link_teacher_account`); liên kết email khác thì tài khoản cũ mất quyền. Khóa/mở khóa bằng `set_teacher_account_active`.

### 2.3. Tên lớp
- `MônKhôngDấu_Khối_TênGọiGV_STT`, ví dụ `VatLi_12_Nam_1`. Tên gọi giáo viên là từ cuối của họ tên, bỏ dấu.
- Hai giáo viên trùng tên gọi (Lam/Lâm) cùng **từng** dạy một môn (kể cả lớp đã ẩn và lịch sử) thì cả hai thêm chữ theo thứ tự được thêm vào Trung tâm: `LamA`, `LamB`; khác môn thì không thêm.
- Tên luôn tính từ dữ liệu hiện tại: sửa họ tên giáo viên thì tên lớp và nhãn lịch sử đổi theo. Giao diện không tự ghép tên, chỉ xem trước qua `preview_class_name`.
- STT để trống thì Database chọn số nhỏ nhất còn trống.

### 2.4. Lịch học theo thời kỳ
- Sửa lịch của lớp thì chọn "Áp dụng lịch mới từ ngày"; lịch cũ vẫn dùng để kiểm điểm danh các ngày trước đó. Giao diện hiện lịch đang áp dụng hôm nay và báo "(lịch mới từ DD/MM/YYYY)" nếu có lịch sắp áp dụng.
- Mọi kiểm tra "ngày có buổi học" dùng lịch hiệu lực của chính ngày đó (`class_has_session`; `lib/schedule.js` ở giao diện).

### 2.5. Điểm danh, đơn giá đóng băng & học bù
- Có mặt và Vắng **tính tiền**; Có phép **không tính** (0đ). Doanh thu và học phí **chỉ cộng `price_snapshot`**, không bao giờ nhân với `classes.price_per_session`.
- Đổi Có mặt ↔ Vắng giữ giá đã đóng băng; chấm mới hoặc từ Có phép sang tính tiền lấy giá hiện tại của lớp.
- **Học bù** (`record_makeup`): học sinh lớp khác **cùng giáo viên** (không cần cùng khối) học bù ở lớp đang mở, chọn buổi gốc. Buổi bù là Có mặt ở lớp bù, ghi danh vẫn là của lớp gốc, giá là giá đóng băng của buổi gốc (buổi gốc chưa tính tiền thì lấy giá hiện tại của lớp gốc); buổi gốc chuyển thành Có phép. Mỗi buổi gốc chỉ bù 1 lần. Học phí của buổi bù tính về lớp gốc.
- **Hủy học bù** (`cancel_makeup`): xóa buổi bù và trả buổi gốc về đúng trạng thái/giá trước khi bù. Buổi bù và buổi gốc đã được bù không sửa bằng nút điểm danh thường.
- Giao diện lưu điểm danh theo hàng đợi tuần tự (bấm liên tục được) và thay bằng dòng máy chủ trả về.

### 2.6. Ghi danh, cho nghỉ, đổi lớp
- Cho nghỉ là xóa mềm (`status = 'dropped'`, `left_at`, `left_reason`). Có điểm danh sau ngày nghỉ thì phải xác nhận xóa các buổi đó; buổi học bù bị xóa thì buổi gốc được trả lại như trước khi bù.
- Đổi lớp trong một giao dịch: vào lớp mới từ ngày chuyển, nghỉ lớp cũ cùng ngày (`left_reason = 'transferred'`, `transfer_to_id` trỏ ghi danh mới).
- Đăng ký học sinh mới bắt buộc chọn lớp. Cùng phụ huynh + cùng họ tên (so bằng `_norm_name`: không phân biệt hoa thường, **phân biệt dấu**) là cùng một em: không tạo mã thứ hai. Đăng ký, sửa học sinh và nhập CSV dùng chung quy tắc này.

### 2.7. Nhóm lớp
- Gom các lớp dạy cùng nội dung vào các "phần" (ví dụ Vật Lí 12: phần 1 = lớp 1, 2; phần 2 = lớp 3, 4). Một lớp thuộc tối đa một nhóm; chỉ Quản lý cấu hình.
- Học sinh **không được** học hai lớp cùng phần (chặn cứng, kiểm lúc COMMIT; nhập CSV báo lỗi theo dòng). Học sinh thiếu phần nào thì chỉ **cảnh báo**, kèm sĩ số từng phần (`ClassGroupsPanel`).

### 2.8. Khóa sổ theo tháng
- Chỉ chốt được tháng đã qua. Sau khi chốt, không ai thêm/sửa/xóa điểm danh có ngày trong tháng đó (kể cả học bù và xóa điểm danh khi cho nghỉ/đổi lớp). Mở lại bắt buộc ghi lý do (vào nhật ký). Không có thu tiền hay công nợ.

### 2.9. Nhật ký thay đổi (`audit_log`)
- Trigger tự ghi mọi thay đổi dữ liệu nghiệp vụ, dù do Quản lý hay Giáo viên, kèm người thực hiện và vai trò. Đổi lịch học, khóa sổ, sao lưu, chuyển năm học, khôi phục do RPC tự ghi.
- Ghi từng dòng; `batch_id` (mã giao dịch) để giao diện gộp các dòng cùng một lần bấm. `price_snapshot` ghi đúng giá đóng băng cũ/mới.
- Nhóm lọc: `attendance`, `makeup`, `enrollment`, `class`, `student`, `teacher`, `system`. Chỉ Quản lý đọc; không ai sửa/xóa, trừ `clear_audit_logs_before` (mục 2.10).

### 2.10. Năm học, sao lưu & làm mới nhật ký
- Năm học của Trung tâm: 15/06 → 12/06 năm sau (`vn_school_year_bounds`, `getCurrentSchoolYearBounds`).
- Gói Supabase Free không tự sao lưu: Quản lý tải `.json` toàn hệ thống và CSV (Học sinh & Phụ huynh, Lớp học & Lịch học, Điểm danh & Học phí tháng) ở **Tổng quan → Sao lưu & Năm học**. CSV có BOM UTF-8, SĐT dạng `="0912..."`, ô bắt đầu bằng `= + - @` được thêm `'` chống chèn công thức. Mỗi lần xuất ghi 1 dòng nhật ký.
- Xóa nhật ký cũ (`clear_audit_logs_before`) là ngoại lệ có kiểm soát: chỉ Quản lý, ngày chốt đã qua, số dòng trong file vừa tải phải khớp số dòng sắp xóa, gõ `XOA NHAT KY`.

### 2.11. Chuyển năm học & lịch sử nhãn lớp
- `rollover_school_year` (chỉ Quản lý, gõ `CHUYEN NAM HOC`): ngày chuyển do Quản lý chọn, không ở tương lai và sau buổi điểm danh cuối của mọi lớp.
  - Lớp khối **5, 9, 12**: học sinh hoàn thành (`left_reason = 'graduated'`, ngày nghỉ = ngày chuyển − 1), lớp được ẩn, giữ tên. Thẻ "Học sinh xin nghỉ" ở Tổng quan không tính các em này.
  - Lớp khác lên 1 khối, tên tự đổi. Kiểm tra cùng khối ở cuối; sai thì hủy toàn bộ. Học sinh lưu ban xử lý tay.
- Mỗi lần đổi môn/khối/STT/giáo viên của lớp, trigger lưu nhãn cũ vào `class_versions`. Hồ sơ học sinh và báo cáo tháng hiện tên lớp **theo ngày điểm danh** (`lib/classVersions.js`, `class_label_on`); màn hình lớp đang hoạt động dùng nhãn hiện tại. Điểm danh, giá và doanh thu không đổi.

### 2.12. Khôi phục từ file sao lưu
- Chỉ nhận file `.json` của hệ thống hiện tại (phiên bản `V3`); file của hệ thống cũ (V2) bị từ chối.
- **Thay thế hoàn toàn** dữ liệu nghiệp vụ bằng nội dung file (giáo viên, phụ huynh, học sinh, lớp, lịch, ghi danh, điểm danh, lịch sử nhãn lớp, khóa sổ, nhóm lớp); dữ liệu phát sinh sau lúc sao lưu bị mất.
- **Giữ nguyên:** tài khoản Quản lý và toàn bộ nhật ký (nhật ký trong file không nạp lại; ghi thêm 1 dòng `center_restore`). Tài khoản Giáo viên trong file được nối theo **email** với user đang có trong Authentication. Bộ đếm mã HS/PH không lùi.
- Luồng: tải file lên `restore_staging` từng phần 500 dòng → xem trước (bảng so sánh "sẽ thêm / sẽ mất") → gõ `KHOI PHUC`. Một giao dịch; đây là ngoại lệ có kiểm soát thứ hai của quy tắc cấm xóa dữ liệu.

### 2.13. Nhập học sinh từ CSV
- Chỉ Quản lý, tối đa 500 dòng/lần, dấu `,` `;` hoặc Tab, UTF-8. Cột: họ tên học sinh, SĐT học sinh, họ tên phụ huynh, SĐT phụ huynh (bắt buộc), tên lớp (phải có sẵn, đang hiển thị), ngày vào lớp.
- Kiểm tra trước; còn bất kỳ lỗi nào thì không ghi gì. Học sinh nhận diện bằng họ tên + SĐT phụ huynh (mục 2.6); đã có thì chỉ ghi danh thêm. Thiếu tên phụ huynh thì dùng tên tạm `(Chưa cập nhật tên)`.

### 2.14. Nối app giao bài tập ScienceApp
- ScienceApp (kho và project Supabase riêng) nối vào Database này bằng tài khoản CSDL `sciencehub_link`, mọi thứ nằm trong schema riêng `sciencehub` (PostgREST không mở):
  - đọc học sinh/lớp/ghi danh qua `sciencehub.roster()` (mã HS làm tên đăng nhập; có SĐT phụ huynh chỉ để làm mật khẩu ban đầu; không đọc tên phụ huynh, SĐT học sinh, học phí);
  - ghi điểm vào `sciencehub.results` (mỗi bài × học sinh một dòng, nối bằng mã HS, không khóa ngoại).
- Điểm chỉ hiện ở hồ sơ học sinh, tab **"Lịch sử làm bài tập"** (`student_homework_history`). `sciencehub.results` không nằm trong file sao lưu; mất thì ScienceApp gửi lại (`npm run dong-bo -- gui-diem tat-ca`).

---

## 3. Frontend (`src/`)
- **`App.jsx`**: cổng đăng nhập (chưa có khóa Supabase thì dừng ở trang Đăng nhập), kiểm `my_profile()`, xử lý `PASSWORD_RECOVERY`, tự đăng xuất khi hết phiên 48 giờ của Giáo viên, điều hướng bằng state (không dùng router), lối tắt từ Tổng quan sang màn hình Điểm danh. Trang Tổng quan và Giáo viên tải riêng (`lazy`).
- **`pages/`**: `LoginPage`, `DashboardPage`, `ClassesPage`, `StudentsPage`, `TeachersPage`.
- **`components/`** dùng chung: `PageShell`, `Modal`, `ConfirmDialog`, `FormActions` (cặp nút Hủy / nút chính cuối hộp thoại), `FormField`, `SelectField`, `SearchInput`, `MobileFilters`, `MonthNav`, `Notice`, `EmptyState`, `RowActions`.
  - `layout/` (`AppLayout`, `Sidebar`, `BottomNav`, `navItems.js` lọc menu theo vai trò), `auth/`, `dashboard/`, `audit/` (`AuditLogModal`), `backup/` (`BackupModal` + các phần `MonthCloseSection`, `RolloverSection`, `RestoreSection`).
  - `classes/`: `ClassForm`, `ClassRoster`, `ClassAttendance`, `MakeupModal`, `EnrollStudentModal`, `RegisterStudentFlow`, `DropEnrollmentDialog`, `ChangeTeacherDialog`, `ClassGroupsModal`, `ClassGroupsPanel`, `TeacherStatsBar`.
  - `students/`: `StudentProfile`, `AddClassModal`, `TransferClassModal`, `ClassPickList`, `ImportStudentsModal`, `HomeworkHistory`.
  - `teachers/`: `TeacherProfile`, `TeacherAccountPanel`, `AccountBadge`.
- **`lib/`**:
  - Kết nối & lỗi: `supabaseClient.js`, `fetchAll.js` (tải theo trang, tránh bị cắt ngầm ở 1000 dòng), `errors.js` (dịch lỗi sang tiếng Việt; nhánh cụ thể đặt trước nhánh chung).
  - Định dạng & chữ: `format.js` (tiền, ngày), `text.js` (bỏ dấu, sắp theo tên gọi), `validators.js`, `subjects.js`, `grade.js`.
  - Nghiệp vụ (hàm thuần, có test ở `scripts/test-js.mjs`): `schedule.js` (lịch theo thời kỳ, `todayISO`), `tuition.js` (học phí tháng, tháng/năm), `classGroups.js`, `homework.js`, `dashboard.js` (`classTitle`, màu môn).
  - Gọi RPC theo chức năng: `classNamePreview.js`, `classVersions.js`, `transfer.js`, `monthClose.js`, `rollover.js`, `restore.js`, `backup.js`, `importStudents.js`, `auditLog.js`, `teacherAccount.js`, `voice.js` (điểm danh giọng nói, Web Speech API).
  - Kiểu dùng chung: `buttonStyles.js` (`BTN_PRIMARY`, `BTN_SECONDARY`, `BTN_DANGER`), `rowTableStyle.js`, `pointer.js` (chỉ tự focus ô nhập trên thiết bị có chuột).
- `vercel.json`: SPA rewrite, header bảo mật, CSP (chế độ chặn; `microphone=(self)` cho điểm danh giọng nói).

---

## 4. Giao diện & luồng thao tác

### 4.1. Bố cục chung
- Nền xám sáng, thẻ trắng viền mảnh, màu nhấn xanh dương. Máy tính có `Sidebar`; điện thoại có `BottomNav` ở đáy. Quản lý: Tổng quan, Lớp học, Học sinh, Giáo viên, Tài khoản; Giáo viên: Lớp học, Học sinh, Tài khoản.
- Danh sách: **bảng** từ `md:` trở lên, **thẻ** trên điện thoại. Tên học sinh/giáo viên/lớp là nút chữ xanh mở chi tiết ngay trong trang; "Quay lại" giữ nguyên bộ lọc và từ khóa.
- Nút cao tối thiểu 44px; hộp thoại trượt từ đáy trên điện thoại, không đóng khi bấm ra ngoài.

### 4.2. Tổng quan (chỉ Quản lý)
- Nút **Nhật ký thay đổi** và **Sao lưu & Năm học** (6 phần: 1. Sao lưu `.json`, 2. Xuất CSV, 3. Khóa sổ tháng, 4. Làm mới nhật ký, 5. Chuyển năm học, 6. Khôi phục từ file sao lưu).
- Chọn tháng; 6 thẻ: Số lớp, Số giáo viên, Học sinh đang học (không trùng), Học sinh mới, Học sinh xin nghỉ, Doanh thu dự kiến (cộng `price_snapshot`, kèm số buổi tính phí).
- **Lịch học trong ngày** (Hôm qua / Hôm nay / Ngày mai / chọn ngày): khung giờ, lớp, giáo viên, trạng thái điểm danh. Bấm một dòng để mở thẳng màn hình Điểm danh của lớp đó, đúng ngày đó.

### 4.3. Lớp học & Điểm danh
- **Danh sách:** mặc định chỉ lớp có lịch hôm nay; công tắc "Hiện tất cả lớp", "Hiện cả lớp đã ẩn"; lọc theo ngày, khối, môn; tìm kiếm. Nút **Nhóm lớp** (Quản lý) và bảng cảnh báo nhóm lớp. Giáo viên có thanh thống kê riêng (`TeacherStatsBar`).
- **Form lớp:** chọn môn, khối, giáo viên, STT (tùy chọn); tên lớp xem trước từ Database. Lịch: tích các thứ, mỗi thứ giờ bắt đầu/kết thúc riêng; khi sửa lịch chọn "Áp dụng lịch mới từ ngày".
- **Chi tiết lớp (`ClassRoster`)**, 2 tab:
  - **Học sinh:** đang học và đã nghỉ (kèm lý do), sắp theo tên gọi; "Thêm học sinh" (`EnrollStudentModal`: theo SĐT phụ huynh hoặc tìm học sinh), "Cho nghỉ" (`DropEnrollmentDialog`); nút "Lịch sử lớp" (Quản lý).
  - **Điểm danh (`ClassAttendance`):** chọn ngày (nút nhảy giữa các ngày có lịch); "Tất cả có mặt", "Nghỉ (cả lớp có phép)" cho các em chưa chấm; điểm danh giọng nói; "+ Học bù"; mỗi em 3 nút Có mặt / Vắng / Có phép và nút xóa; "Hủy học bù" ở buổi bù. Tháng đã chốt sổ (và tháng trước với Giáo viên) chỉ xem.

### 4.4. Học sinh & Hồ sơ
- **Danh sách:** tìm không dấu theo tên, mã HS, SĐT học sinh/phụ huynh; lọc theo lớp, khối, môn; "Hiện cả học sinh đã ẩn". "Đăng ký học sinh" (`RegisterStudentFlow`, bắt buộc chọn lớp trước) và "Nhập từ file" (Quản lý).
- **Hồ sơ (`StudentProfile`):** thông tin học sinh và phụ huynh; nút "Lịch sử thay đổi" (Quản lý). Tab **Lớp & học phí**: lớp đang học ("+ Đăng ký thêm lớp" cùng khối, "Đổi lớp" trên từng lớp), học phí theo tháng (tổng cộng dồn `price_snapshot`, số buổi Có mặt / Vắng / Có phép / còn lại theo lịch, chi tiết từng ngày; buổi bù gom về lớp gốc với nhãn "Học bù tại lớp X"; tên lớp theo ngày). Tab **Lịch sử làm bài tập**: điểm từ ScienceApp.

### 4.5. Giáo viên (chỉ Quản lý)
- Danh sách (tìm kiếm, Thêm/Sửa/Ẩn/Khôi phục, hiện mục đã ẩn) kèm nhãn tài khoản: Chưa cấp tài khoản / Đang hoạt động / Đã khóa.
- **Hồ sơ:** liên kết tài khoản đăng nhập (email đã tạo trong Authentication), khóa/mở khóa; thông tin liên hệ, số học sinh đang dạy, các lớp phụ trách kèm lịch, đơn giá, sĩ số. Không hiển thị lương hay doanh thu.

---

## 5. Trang giới thiệu (`site/`, sciencehub.id.vn)
Web công khai cho phụ huynh và học sinh, dự án Vercel riêng trong cùng kho (Root Directory `site`). Astro 7 dựng trang
HTML tĩnh; phần cần bấm là component React; cùng Tailwind, `lucide-react`, logo và bảng màu với app này và app giao bài.
Chi tiết kỹ thuật: `site/README.md`.

### 5.1. Danh xưng, học phí và các tab
- **Danh xưng trên web** (người dùng chốt 25/11/2026): "Lớp học ScienceHub", trong câu gọi tắt "ScienceHub". Chữ
  "Trung tâm" trên web chỉ dùng cho **Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy**: ScienceHub cộng tác với Trung tâm,
  mức học phí do Trung tâm quy định, phụ huynh đóng học phí cho quản lý của Trung tâm. App quản lý này vẫn giữ tên cũ.
- **Học phí trên web** chép theo tờ "Quy định thu học phí" của Trung tâm (`site/src/data/fees.js`: bảng 600.000đ/tháng
  cho lớp 2 buổi/tuần, 75.000đ/buổi cho KHTN cấp 2, 4 quy định khi nghỉ), **không** lấy `price_per_session` của app này.
- **Trang chủ**, **Quy định** (nội quy, xin nghỉ và học bù, học phí, lịch chia theo phần), **Chính sách bảo mật**: nội dung
  tĩnh; thông tin liên hệ, địa chỉ, giờ làm việc, lời giới thiệu ở `site/src/data/center.js`.
- **Tra cứu điểm** (`/tra-cuu-diem`, xong 24/11/2026): giao diện của web, dữ liệu do máy chủ ScienceApp
  (`/api/parent/*`) trả qua đường chuyển tiếp `/api/diem/*` (`site/vercel.json`). Không đọc CSDL Trung tâm.
- **Lớp học & học phí** (mốc M2, xong 25/11/2026): lịch học các lớp Vật Lí, Hóa học (`CLASS_SUBJECTS` ở
  `site/src/data/center.js`) lấy tự động qua `/api/lop-hoc`, gom theo môn + khối; lớp thuộc nhóm lớp hiện theo phần
  ("Phần 1 · chọn 1 trong 2 ca"); mỗi lớp ghi "Nhóm N" (như `classTitle` của app này), tên giáo viên, các buổi đang
  áp dụng và "Lịch mới từ DD/MM/YYYY" nếu đã đặt lịch mới. Bảng học phí theo mục trên. **Đăng ký học**: chờ mốc M3.

### 5.2. Nối CSDL Trung tâm
- Theo cách của mục 2.14: file `supabase/v3/11_website.sql`, schema riêng `website`, tài khoản CSDL `website_link`
  (tạo bằng `supabase/v3/website_link.sql`, mật khẩu không nằm trong kho) chỉ gọi được các hàm trong schema đó.
  Hàm máy chủ Vercel `site/api/*.js` (thư viện `postgres`, biến `WEBSITE_DATABASE_URL` = chuỗi Transaction pooler
  với người dùng `website_link.<mã project>`) gọi các hàm này; `anon` vẫn không có quyền gì (mục 1.3 giữ nguyên).
- `website.catalog(p_subjects)` (xong 25/11/2026): lớp đang hiển thị của các môn được chọn (môn, khối, STT, **tên giáo
  viên**, nhóm lớp + phần), mọi dòng lịch còn hiệu lực từ hôm nay kèm `from`/`to`. Không trả đơn giá (học phí theo
  mục 5.1), học sinh, phụ huynh, điểm danh, doanh thu. `/api/lop-hoc` được Vercel lưu đệm 5 phút. Test:
  `v3_website.test.mjs`; phần xử lý ở `site/src/lib/catalog.js` (test trong `scripts/test-js.mjs`).
- `website.submit_registration(...)` ghi vào `website.registration_requests`. **Chọn lịch theo nhóm lớp:** lớp thuộc
  nhóm thì phụ huynh chọn **đúng một ca ở mỗi phần** đang mở của nhóm (không được hai ca cùng phần vì cùng nội dung,
  không được thiếu phần); kiểm tra ở cả form và SQL. Chống spam: ô bẫy, giới hạn theo IP và SĐT.
- Đơn đăng ký chỉ Quản lý xem, để liên hệ phụ huynh trực tiếp (màn hình "Đơn đăng ký" trong app này, RPC có
  `assert_manager()`). **Không nằm trong file sao lưu** (người dùng chốt 24/11/2026, giống `sciencehub.results`).
