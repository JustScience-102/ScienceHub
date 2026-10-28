import { useEffect, useState } from 'react'
import { Banknote, ChevronLeft, ChevronRight, GraduationCap, School } from 'lucide-react'
import Notice from '../Notice'
import StatCard from '../dashboard/StatCard'
import { supabase } from '../../lib/supabaseClient'
import { formatCurrency } from '../../lib/format'
import { todayISO } from '../../lib/schedule'
import { monthLabel, monthOf, sameMonth, shiftMonth } from '../../lib/tuition'
import { dashboardError, parseSummary } from '../../lib/dashboard'

const NAV_BTN =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

// Thanh thống kê riêng của Giáo viên ở đầu trang Lớp học (dữ liệu từ dashboard_summary, nhánh Giáo viên).
// Số lớp và số học sinh là con số HIỆN TẠI; doanh thu và số buổi tính phí theo Tháng/Năm đang chọn.
// refreshKey đổi khi danh sách lớp được tải lại để thẻ thống kê cập nhật theo.
export default function TeacherStatsBar({ refreshKey }) {
  const currentMonth = monthOf(todayISO())
  const [month, setMonth] = useState(currentMonth)
  const [state, setState] = useState({ key: '', data: null, error: '' })

  const key = `${month.year}-${month.month}-${refreshKey}`

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        p_year: month.year,
        p_month: month.month,
      })
      if (cancelled) return
      setState((prev) => ({
        key,
        data: error ? prev.data : parseSummary(data),
        error: error ? dashboardError(error) : '',
      }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [month, key])

  const loading = state.key !== key
  const summary = state.data
  const isCurrentMonth = sameMonth(month, currentMonth)

  return (
    <section aria-labelledby="teacher-stats-title" className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="teacher-stats-title" className="text-lg font-semibold text-slate-800">
          Thống kê của bạn
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
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
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isCurrentMonth}
            aria-label="Tháng sau"
            className={NAV_BTN}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setMonth(currentMonth)}
              className="ml-1 min-h-11 rounded-lg px-3 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              Tháng này
            </button>
          )}
        </div>
      </div>

      {!loading && state.error && <Notice type="error">{state.error}</Notice>}

      {!summary && loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100/70" />
          ))}
        </div>
      ) : (
        summary && (
          <div className={`grid gap-3 transition-opacity sm:grid-cols-3 ${loading ? 'opacity-60' : 'opacity-100'}`}>
            <StatCard icon={School} label="Lớp đang phụ trách" value={summary.classCount} hint="Hiện tại" tone="sky" />
            <StatCard
              icon={GraduationCap}
              label="Tổng số học sinh đang dạy"
              value={summary.studentCount}
              hint="Hiện tại, mỗi em chỉ đếm một lần"
              tone="emerald"
            />
            <StatCard
              icon={Banknote}
              label={`Doanh thu ${monthLabel(month).toLowerCase()}`}
              value={formatCurrency(summary.revenue)}
              hint={`${summary.chargedSessions} lượt tính tiền (Có mặt + Vắng)`}
              tone="slate"
            />
          </div>
        )
      )}
    </section>
  )
}
