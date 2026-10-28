import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  GraduationCap,
  History,
  School,
  UserMinus,
  UserPlus,
  UserSquare,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import Notice from '../components/Notice'
import FormField from '../components/FormField'
import StatCard from '../components/dashboard/StatCard'
import TodaySchedule from '../components/dashboard/TodaySchedule'
import AuditLogModal from '../components/audit/AuditLogModal'
import BackupModal from '../components/backup/BackupModal'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { formatCurrency, formatDate } from '../lib/format'
import { addDaysISO, todayISO, weekdayLabel } from '../lib/schedule'
import { monthLabel, monthOf, sameMonth, shiftMonth } from '../lib/tuition'
import { dashboardError, parseSummary } from '../lib/dashboard'

const NAV_BTN =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

// onOpenAttendance(classId, date): do App.jsx truyền vào để nhảy sang màn hình Điểm danh của lớp.
export default function DashboardPage({ onOpenAttendance }) {
  const today = todayISO()
  const currentMonth = monthOf(today)

  const [month, setMonth] = useState(currentMonth)
  const [scheduleDate, setScheduleDate] = useState(today)
  const [summaryState, setSummaryState] = useState({ key: '', data: null, error: '' })
  const [scheduleState, setScheduleState] = useState({ key: '', rows: [], error: '' })
  const [auditOpen, setAuditOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)

  const summaryKey = `${month.year}-${month.month}`
  const scheduleKey = scheduleDate

  // Thẻ thống kê: tải lại khi đổi Tháng/Năm. Database tính sẵn từng con số.
  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        p_year: month.year,
        p_month: month.month,
      })
      if (cancelled) return
      setSummaryState((prev) => ({
        key: `${month.year}-${month.month}`,
        data: error ? prev.data : parseSummary(data),
        error: error ? dashboardError(error) : '',
      }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [month])

  // Lịch học: tải lại khi đổi ngày. Trang mở lại mỗi lần vào Dashboard nên lớp vừa tạo hiện ngay.
  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('dashboard_schedule', { p_date: scheduleDate })
      if (cancelled) return
      setScheduleState((prev) => ({
        key: scheduleDate,
        rows: error || !Array.isArray(data) ? prev.rows : data,
        error: error ? dashboardError(error) : '',
      }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [scheduleDate])

  const summaryLoading = summaryState.key !== summaryKey
  const scheduleLoading = scheduleState.key !== scheduleKey
  const summary = summaryState.data
  const isCurrentMonth = sameMonth(month, currentMonth)

  const quickDates = useMemo(
    () => [
      { label: 'Hôm qua', value: addDaysISO(today, -1) },
      { label: 'Hôm nay', value: today },
      { label: 'Ngày mai', value: addDaysISO(today, 1) },
    ],
    [today],
  )

  const dayTitle =
    scheduleDate === today ? 'Lịch học hôm nay' : `Lịch học ${weekdayLabel(scheduleDate).toLowerCase()}`

  if (!isSupabaseConfigured) {
    return (
      <PageShell title="Tổng quan Trung tâm">
        <Notice type="error">
          Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
        </Notice>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Tổng quan Trung tâm"
      description="Bức tranh tổng quan của Trung tâm theo từng tháng."
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAuditOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <History size={16} className="text-sky-600" aria-hidden="true" />
          Nhật ký thay đổi
        </button>
        <button
          type="button"
          onClick={() => setBackupOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3.5 text-sm font-medium text-sky-700 hover:bg-sky-100"
        >
          <DatabaseBackup size={16} aria-hidden="true" />
          Sao lưu & Năm học
        </button>
      </div>

      <section aria-labelledby="stats-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="stats-title" className="text-lg font-semibold text-slate-800">
            Thống kê {monthLabel(month).toLowerCase()}
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

        {!summaryLoading && summaryState.error && <Notice type="error">{summaryState.error}</Notice>}

        {!summary && summaryLoading ? (
          <div
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
            aria-label={`Trung tâm đang tải số liệu ${monthLabel(month).toLowerCase()}...`}
          >
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className={`h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100/70 ${
                  item === 6 ? 'col-span-2 md:col-span-1' : ''
                }`}
              />
            ))}
          </div>
        ) : (
          summary && (
            <div className={`space-y-3 transition-opacity ${summaryLoading ? 'opacity-60' : 'opacity-100'}`}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard icon={School} label="Số lớp" value={summary.classCount} tone="sky" />
                <StatCard icon={UserSquare} label="Số giáo viên" value={summary.teacherCount} tone="sky" />
                <StatCard
                  icon={GraduationCap}
                  label="Học sinh đang học"
                  value={summary.studentCount}
                  hint={isCurrentMonth ? 'Tính đến hôm nay' : `Tính đến ${formatDate(summary.asOf)}`}
                  tone="sky"
                />
                <StatCard
                  icon={UserPlus}
                  label="Học sinh mới"
                  value={summary.newStudents}
                  hint="Thêm trong tháng"
                  tone="emerald"
                />
                <StatCard
                  icon={UserMinus}
                  label="Học sinh xin nghỉ"
                  value={summary.droppedStudents}
                  hint="Nghỉ hẳn trong tháng"
                  tone="amber"
                />
                <StatCard
                  icon={Banknote}
                  label="Doanh thu dự kiến"
                  value={formatCurrency(summary.revenue)}
                  hint={
                    isCurrentMonth
                      ? `Từ ${formatDate(summary.monthStart)} đến hôm nay · ${summary.chargedSessions} lượt tính tiền`
                      : `Cả tháng · ${summary.chargedSessions} lượt tính tiền`
                  }
                  tone="slate"
                  wide
                />
              </div>
              <p className="text-xs text-slate-500">
                Doanh thu cộng giá đã lưu của các buổi Có mặt và Vắng đã điểm danh. Vắng có phép không tính tiền. Đổi
                đơn giá lớp sau này không làm đổi doanh thu các buổi đã điểm danh.
              </p>
            </div>
          )
        )}
      </section>

      <section aria-labelledby="schedule-title" className="space-y-4 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="schedule-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <CalendarDays size={20} className="text-sky-600" aria-hidden="true" />
              {dayTitle}
            </h2>
            <p className="text-sm text-slate-500">
              {weekdayLabel(scheduleDate)}, {formatDate(scheduleDate)}. Bấm vào một lớp để điểm danh.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {quickDates.map((item) => {
              const active = scheduleDate === item.value
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setScheduleDate(item.value)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
            <div className="w-full sm:w-44">
              <FormField
                id="dashboard-schedule-date"
                label="Chọn ngày khác"
                type="date"
                value={scheduleDate}
                onChange={(value) => value && setScheduleDate(value)}
              />
            </div>
          </div>
        </div>

        {!scheduleLoading && scheduleState.error && <Notice type="error">{scheduleState.error}</Notice>}

        {scheduleLoading && scheduleState.key === '' ? (
          <p className="text-sm text-slate-500">Trung tâm đang tải lịch học...</p>
        ) : (
          !scheduleState.error && (
            <div className={`transition-opacity ${scheduleLoading ? 'opacity-60' : 'opacity-100'}`}>
              <TodaySchedule
                rows={scheduleState.rows}
                date={scheduleDate}
                today={today}
                onOpen={(classId, date) => onOpenAttendance?.(classId, date)}
              />
            </div>
          )
        )}
      </section>

      {auditOpen && <AuditLogModal onClose={() => setAuditOpen(false)} />}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
    </PageShell>
  )
}