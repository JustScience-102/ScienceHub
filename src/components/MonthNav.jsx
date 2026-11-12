import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, sameMonth, shiftMonth } from '../lib/tuition'

const NAV_BTN =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

// Bộ chuyển Tháng trước / Tháng sau / "Tháng này" dùng chung cho Tổng quan, thống kê Giáo viên và hồ sơ học sinh.
// Không cho đi quá tháng hiện tại (currentMonth). month / currentMonth: { year, month }.
export default function MonthNav({ month, currentMonth, onChange }) {
  const isCurrentMonth = sameMonth(month, currentMonth)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Tháng trước"
        className={NAV_BTN}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="min-w-28 text-center text-sm font-semibold text-slate-800" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrentMonth}
        aria-label="Tháng sau"
        className={NAV_BTN}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={() => onChange(currentMonth)}
          className="ml-1 min-h-11 rounded-lg px-3 text-sm font-medium text-sky-700 hover:bg-sky-50"
        >
          Tháng này
        </button>
      )}
    </div>
  )
}
