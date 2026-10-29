import { useEffect } from 'react'
import { X } from 'lucide-react'

// Hộp thoại: trên điện thoại trượt lên từ đáy, trên máy tính nằm giữa màn hình.
// Đóng bằng nút X, nút Hủy hoặc phím Esc (không đóng khi bấm ra ngoài để tránh mất dữ liệu đang nhập).
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
