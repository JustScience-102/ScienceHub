// Đổi lỗi kỹ thuật từ Supabase thành câu tiếng Việt dễ hiểu.
export function toVietnameseError(error) {
  if (!error) return ''
  const message = String(error.message ?? '')
  const details = String(error.details ?? '')
  const text = `${message} ${details}`

  // Thông báo do chính Database của Trung tâm viết (RAISE EXCEPTION) đã là tiếng Việt.
  if (error.code === 'P0001') return message

  // V2-3 / V2-4: thiếu hàm/bảng của 06_v2_3_audit_log.sql và 07_v2_4_backup.sql.
  // Đặt TRƯỚC các nhánh cũ; lỗi không khớp tên ở đây vẫn chạy xuống các nhánh cũ như trước.
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /query_audit_logs|clear_audit_logs_before|vn_school_year_bounds/.test(text)
  ) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy file 06_v2_3_audit_log.sql trong Supabase SQL Editor.'
  }
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /export_center_backup|export_monthly_attendance_report/.test(text)
  ) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy file 07_v2_4_backup.sql trong Supabase SQL Editor.'
  }
  if ((error.code === 'PGRST205' || error.code === '42P01') && /audit_log/.test(text)) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy file 06_v2_3_audit_log.sql trong Supabase SQL Editor.'
  }

  // V2-2: thiếu các hàm/bảng của 05_v2_2_teacher_access.sql, và lỗi trùng liên kết tài khoản.
  // Đặt TRƯỚC các nhánh cũ; lỗi không khớp tên ở đây vẫn chạy xuống các nhánh cũ như trước.
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /lookup_parent_by_phone|enroll_existing_student|set_class_hidden|link_teacher_account|set_teacher_account_active|assert_staff|teacher_owns_class|teacher_sees_/.test(text)
  ) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy file 05_v2_2_teacher_access.sql trong Supabase SQL Editor.'
  }
  if (/profiles_teacher_id_key/.test(text)) {
    return 'Giáo viên này đã được liên kết với một tài khoản đăng nhập khác.'
  }

  // V2-1 (BẮT ĐẦU khối Auth/phân quyền): chỉ nhận diện lỗi đăng nhập và quyền truy cập,
  // đặt TRƯỚC các nhánh cũ. Lỗi không khớp ở đây vẫn chạy xuống các nhánh cũ như trước.
  if (/Invalid login credentials/i.test(message) || error.code === 'invalid_credentials') {
    return 'Email hoặc mật khẩu chưa đúng.'
  }
  if (/Email not confirmed/i.test(message) || error.code === 'email_not_confirmed') {
    return 'Email tài khoản chưa được xác nhận.'
  }
  if (/New password should be different/i.test(message) || error.code === 'same_password') {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  }
  if (/Password should be at least/i.test(message) || error.code === 'weak_password') {
    return 'Mật khẩu mới chưa đủ mạnh. Hãy dùng ít nhất 6 ký tự.'
  }
  if (
    /rate limit|too many requests/i.test(message) ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit'
  ) {
    return 'Trung tâm nhận quá nhiều yêu cầu trong thời gian ngắn. Hãy đợi một lúc rồi thử lại.'
  }
  if (/Auth session missing|JWT expired|invalid JWT/i.test(message)) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Trung tâm: Bạn không có quyền thực hiện thao tác này hoặc phiên đăng nhập đã hết hạn.'
  }
  // Nhận diện các hàm RPC đã hợp nhất trong 03_rpc_and_auth.sql
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /my_profile|dashboard_summary|dashboard_schedule|student_presence_spans|transfer_enrollment/.test(text)
  ) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  }
  // V2-1 (KẾT THÚC khối Auth/phân quyền)

  // Điểm danh: chỉ nhận diện đúng tên hàm/ràng buộc của điểm danh, đặt TRƯỚC các nhánh cũ.
  // Lỗi không khớp tên nào ở đây vẫn chạy xuống các nhánh cũ như trước.
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /save_attendance|record_makeup/.test(text)
  ) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  }
  if (/attendance_one_per_day/.test(text)) {
    return 'Học sinh này đã có điểm danh trong ngày này ở lớp này.'
  }

  // Lớp học / ghi danh: nhận diện theo tên cụ thể, đặt TRƯỚC nhánh thiếu hàm/cột chung bên dưới.
  // Lỗi không khớp tên nào ở đây vẫn chạy xuống các nhánh cũ như trước.
  const slice3Hint =
    'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  if (
    (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(message)) &&
    /drop_enrollment|save_class|register_student_in_class/.test(text)
  ) {
    return slice3Hint
  }
  if (
    (error.code === 'PGRST204' || error.code === '42703') &&
    /'?(subject|grade|class_no)'?.*(column|classes)|column .*(subject|grade|class_no)/i.test(text)
  ) {
    return slice3Hint
  }
  if (
    (error.code === 'PGRST205' || error.code === '42P01') &&
    /class_schedules/.test(text)
  ) {
    return slice3Hint
  }
  if (/uq_enrollments_one_active/.test(text)) {
    return 'Học sinh này đang học lớp này rồi.'
  }
  if (/uq_classes_name_active/.test(text)) {
    return 'Tên lớp này đã có. Hãy đổi số thứ tự (STT) để tên lớp không trùng.'
  }

  // Database chưa chạy bộ file SQL: thiếu hàm hoặc thiếu cột deleted_at.
  // Chỉ báo khi đúng các dấu hiệu này; mọi lỗi khác hiện nguyên văn ở cuối hàm
  // để dễ tìm nguyên nhân thật (trước đây gom nhầm cả lỗi trigger vào đây).
  const missingFunction =
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /Could not find the function/i.test(message)
  const missingColumn =
    error.code === 'PGRST204' ||
    (error.code === '42703' && /column .*deleted_at.* does not exist/i.test(message))
  if (missingFunction || missingColumn) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  }

  if (/uq_teachers_phone/.test(text)) {
    return 'Số điện thoại này đã thuộc về một giáo viên khác (có thể giáo viên đó đã bị ẩn: bật "Hiện cả giáo viên đã ẩn" rồi bấm "Khôi phục").'
  }
  if (/uq_students_phone/.test(text)) {
    return 'Số điện thoại này đã thuộc về một học sinh khác (có thể học sinh đó đã bị ẩn: bật "Hiện cả học sinh đã ẩn" rồi bấm "Khôi phục").'
  }
  if (/parents_phone_key/.test(text)) {
    return 'Số điện thoại phụ huynh này đã tồn tại trong Trung tâm.'
  }
  if (/_phone_format/.test(text)) {
    return 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0 (ví dụ 0912345678).'
  }
  if (error.code === '23503') {
    return 'Dữ liệu này đang được liên kết với dữ liệu khác nên chưa thể thay đổi.'
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Trung tâm không kết nối được tới máy chủ. Hãy kiểm tra mạng rồi thử lại.'
  }

  return `Đã có lỗi xảy ra: ${message || 'không rõ nguyên nhân'}`
}