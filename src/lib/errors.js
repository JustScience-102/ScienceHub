// Đổi lỗi kỹ thuật từ Supabase thành câu tiếng Việt dễ hiểu.
// Nhánh cụ thể đặt trước nhánh chung. Tên ràng buộc lấy từ supabase/v3/01_tables.sql.
export function toVietnameseError(error) {
  if (!error) return ''
  const message = String(error.message ?? '')
  const details = String(error.details ?? '')
  const text = `${message} ${details}`

  // Thông báo do chính Database của Trung tâm viết (RAISE EXCEPTION) đã là tiếng Việt.
  if (error.code === 'P0001') return message

  // Thiếu hàm / bảng / cột: bộ supabase/v3 chưa chạy đủ trên project này.
  if (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /Could not find the (function|table)/i.test(message)
  ) {
    return 'Database chưa cài đủ bộ SQL V3. Hãy chạy lần lượt các file trong thư mục supabase/v3 (00 đến 09) trong Supabase SQL Editor.'
  }
  if (/statement timeout|canceling statement/i.test(message)) {
    return 'Thao tác mất quá nhiều thời gian nên máy chủ đã dừng lại và không thay đổi gì. Hãy báo người quản trị hệ thống.'
  }

  // Ràng buộc dữ liệu.
  if (/uq_classes_slot_active/.test(text)) {
    return 'Môn, khối, giáo viên và số thứ tự (STT) này đã có lớp đang hoạt động. Hãy chọn STT khác.'
  }
  if (/uq_attendance_makeup_once/.test(text)) {
    return 'Buổi học này đã được học bù rồi. Mỗi buổi chỉ được bù một lần.'
  }
  if (/attendance_one_per_day/.test(text)) {
    return 'Học sinh này đã có điểm danh trong ngày này ở lớp này.'
  }
  if (/uq_enrollments_one_active/.test(text)) {
    return 'Học sinh này đang học lớp này rồi.'
  }
  if (/profiles_teacher_id_key/.test(text)) {
    return 'Giáo viên này đã được liên kết với một tài khoản đăng nhập khác.'
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

  // Đăng nhập (Supabase Auth) và quyền truy cập (RLS).
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

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Trung tâm không kết nối được tới máy chủ. Hãy kiểm tra mạng rồi thử lại.'
  }

  return `Đã có lỗi xảy ra: ${message || 'không rõ nguyên nhân'}`
}
