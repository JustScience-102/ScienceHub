import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from '../lib/buttonStyles'

// Hàng nút cuối hộp thoại: "Hủy" và nút chính (điện thoại: nút chính nằm trên, dàn hết chiều ngang).
//   onConfirm: bỏ trống thì nút chính là nút gửi form (type="submit"), phải đặt bên trong <form>.
//   busy: đang xử lý, khóa cả hai nút và nút chính hiện busyLabel. disabled: chỉ khóa nút chính.
//   danger: nút chính màu đỏ (xóa, cho nghỉ). extra: nút phụ đặt trước nút Hủy.
export default function FormActions({
  label = 'Lưu',
  busyLabel = 'Đang lưu...',
  busy = false,
  disabled = false,
  danger = false,
  onConfirm,
  onCancel,
  cancelLabel = 'Hủy',
  extra = null,
  className = 'pt-2',
}) {
  return (
    <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${className}`}>
      {extra}
      <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
        {cancelLabel}
      </button>
      <button
        type={onConfirm ? 'button' : 'submit'}
        onClick={onConfirm}
        disabled={busy || disabled}
        className={danger ? BTN_DANGER : BTN_PRIMARY}
      >
        {busy ? busyLabel : label}
      </button>
    </div>
  )
}
