import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

// Bộ lọc phụ: trên điện thoại thu vào nút "Bộ lọc" đóng/mở (mặc định đóng), từ md: trở lên luôn hiện.
// activeCount: số bộ lọc đang khác mặc định hiện thành huy hiệu trên nút.
// actions: nút thao tác chính, hiện cạnh nút Bộ lọc trên điện thoại (máy tính tự đặt nút ở chỗ khác).
export default function MobileFilters({ id, activeCount = 0, actions, className = '', children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <div className="flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
        >
          <span className="flex items-center gap-2 whitespace-nowrap">
            <SlidersHorizontal size={16} className="text-sky-600" aria-hidden="true" />
            Bộ lọc
            {activeCount > 0 && (
              <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white">
                {activeCount}
              </span>
            )}
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {actions}
      </div>
      <div id={id} className={`${open ? 'block' : 'hidden'} mt-3 md:mt-0 md:block`}>
        {children}
      </div>
    </div>
  )
}
