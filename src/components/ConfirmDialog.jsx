import Modal from './Modal'

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
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
