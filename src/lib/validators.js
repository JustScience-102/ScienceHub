// Kiểm tra dữ liệu nhập. Mỗi hàm trả về câu báo lỗi tiếng Việt, hoặc '' nếu hợp lệ.

const PHONE_PATTERN = /^0\d{9}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Bỏ khoảng trắng, dấu chấm, dấu gạch ngang: "0912 345.678" -> "0912345678"
export function normalizePhone(value) {
  return String(value ?? '').replace(/[\s.-]/g, '')
}

export function isValidPhone(value) {
  return PHONE_PATTERN.test(value)
}

export function validatePhone(raw, { required = false } = {}) {
  const phone = normalizePhone(raw)
  if (!phone) return required ? 'Vui lòng nhập số điện thoại.' : ''
  if (!isValidPhone(phone)) {
    return 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0 (ví dụ 0912345678).'
  }
  return ''
}

export function validateEmail(raw) {
  const email = String(raw ?? '').trim()
  if (!email) return ''
  return EMAIL_PATTERN.test(email) ? '' : 'Email chưa đúng định dạng.'
}

export function validateRequired(raw, message) {
  return String(raw ?? '').trim() ? '' : message
}
