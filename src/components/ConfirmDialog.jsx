import Modal from './Modal'
import FormActions from './FormActions'

// Hộp xác nhận trước khi thực hiện thao tác (ví dụ ẩn / xóa).
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Đồng ý',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      <FormActions
        onCancel={onCancel}
        onConfirm={onConfirm}
        busy={busy}
        danger
        label={confirmLabel}
        busyLabel="Đang xử lý..."
        className="mt-6"
      />
    </Modal>
  )
}
