import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const STYLES = {
  success: { box: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  error: { box: 'bg-red-50 text-red-700', icon: AlertTriangle },
  info: { box: 'bg-sky-50 text-sky-700', icon: Info },
}

// Thanh thông báo thành công / lỗi / thông tin.
export default function Notice({ type = 'info', children, onClose }) {
  const { box, icon: Icon } = STYLES[type]
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${box}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="shrink-0 rounded p-0.5 hover:bg-black/5"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
