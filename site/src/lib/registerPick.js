// Nút "Đăng ký lịch này" (ClassSchedule.jsx) và form đăng ký (RegistrationForm.jsx) cùng nằm trên trang chủ.
// Bấm nút: script cuộn trang (src/scripts/scroll-spy.js) đưa xuống phần #dang-ky, còn requestPick báo cho form chọn sẵn
// môn + khối, không tải lại trang. Form chưa dựng (client:visible, chưa cuộn tới lần nào) thì lựa chọn được giữ lại,
// form lấy khi dựng xong. Liên kết vẫn mang ?mon=&khoi= để mở ở tab mới cũng chọn sẵn (form đọc địa chỉ trang).

let pending = null
const listeners = new Set()

export function registerHref(subject, grade) {
  return `/?mon=${encodeURIComponent(subject)}&khoi=${grade}#dang-ky`
}

// Gọi trong onClick của nút. Bấm kèm Ctrl/Shift... (mở tab mới) thì bỏ qua: tab mới tự đọc ?mon=&khoi=.
export function requestPick(event, subject, grade) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const pick = { subject, grade: Number(grade) }
  if (listeners.size === 0) pending = pick
  for (const listener of listeners) listener(pick)
}

// Form đăng ký gọi khi dựng; trả hàm hủy đăng ký.
export function onPick(listener) {
  listeners.add(listener)
  if (pending) {
    const pick = pending
    pending = null
    listener(pick)
  }
  return () => listeners.delete(listener)
}
