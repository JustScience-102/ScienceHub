import { CalendarX, ChevronRight, ClipboardCheck } from 'lucide-react'
import EmptyState from '../EmptyState'
import { formatTime } from '../../lib/schedule'
import { attendanceStatus } from '../../lib/dashboard'

const TONES = {
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-sky-50 text-sky-700',
  done: 'bg-emerald-50 text-emerald-700',
  muted: 'bg-slate-100 text-slate-600',
}

// Danh sách "Lịch học trong ngày". Bấm một dòng để mở thẳng màn hình Điểm danh của lớp đó.
export default function TodaySchedule({ rows, date, today, onOpen }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Không có lớp nào học trong ngày này"
        text="Lớp có lịch học vào thứ của ngày này sẽ hiện ở đây ngay khi được tạo."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const status = attendanceStatus(row, date, today)
        return (
          <li key={`${row.class_id}|${row.start_time}`}>
            <button
              type="button"
              onClick={() => onOpen(row.class_id, date)}
              aria-label={`Mở điểm danh lớp ${row.name}`}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:gap-4 sm:p-4"
            >
              <div className="w-24 shrink-0 text-sm sm:w-28">
                <p className="font-semibold text-slate-800">{formatTime(row.start_time)}</p>
                <p className="text-slate-500">đến {formatTime(row.end_time)}</p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{row.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {row.teacher_name || 'Chưa gắn giáo viên'}
                  {row.grade ? ` · Khối ${row.grade}` : ''}
                  {` · ${Number(row.total_count) || 0} học sinh`}
                </p>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TONES[status.tone]}`}
                >
                  {status.tone === 'done' && <ClipboardCheck size={12} aria-hidden="true" />}
                  {status.label}
                </span>
              </div>

              <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
