// Kiểm tra dùng chung cho test Database (dựa trên node:assert, không cần thư viện ngoài).
import assert from 'node:assert/strict'

export { assert }

// Lời gọi phải bị từ chối với thông báo khớp mẫu (chuỗi con hoặc RegExp). Trả về lỗi để kiểm tra thêm.
export async function expectError(promise, pattern) {
  let error = null
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `Mong đợi lỗi "${pattern}" nhưng lệnh chạy thành công`)
  const message = String(error.message ?? '')
  const matched = pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
  assert.ok(matched, `Mong đợi lỗi khớp "${pattern}", nhận được: ${message}`)
  return error
}

// Lời gọi bị từ chối vì thiếu quyền (bảng/hàm không được cấp cho vai trò này).
export function expectDenied(promise) {
  return expectError(promise, /permission denied|quyền|không có quyền/i)
}
