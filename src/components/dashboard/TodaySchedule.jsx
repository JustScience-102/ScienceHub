import { CalendarX, ChevronRight } from 'lucide-react'
import EmptyState from '../EmptyState'
import { formatTime } from '../../lib/schedule'
import { attendanceStatus, classTitle, subjectColor } from '../../lib/dashboard'
import { CELL, CELL_CLICKABLE, ROW, ROW_TABLE } from '../../lib/rowTableStyle'

const TONES = {
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-sky-50 text-sky-700',
  done: 'bg-emerald-50 text-emerald-700',
  muted: 'bg-slate-100 text-slate-600',
}

// Bảng "Lịch học trong ngày" (đã sắp theo giờ học). Bấm một dòng để mở thẳng màn hình Điểm danh của lớp đó.
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
    <>
    {/* Điện thoại: dạng thẻ, bấm cả thẻ để mở điểm danh */}
    <ul className="space-y-3 md:hidden">
      {rows.map((row) => {
        const status = attendanceStatus(row, date, today)
        return (
          <li key={`${row.class_id}|${row.start_time}`}>
            <button
              type="button"
              onClick={() => onOpen(row.class_id, date)}
              aria-label={`Mở điểm danh lớp ${row.name}`}
              className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">
                  {formatTime(row.start_time)}
                  <span className="font-normal text-slate-400"> – </span>
                  {formatTime(row.end_time)}
                </span>
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONES[status.tone]}`}
                >
                  {status.label}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={`break-all rounded-lg px-2.5 py-1 text-sm font-semibold ${subjectColor(row.subject)}`}
                >
                  {classTitle(row)}
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{row.teacher_name || 'Chưa gắn giáo viên'}</span>
                {' · '}Sĩ số {Number(row.total_count) || 0}
              </p>
            </button>
          </li>
        )
      })}
    </ul>

    <div className="hidden overflow-x-auto md:block">
      <table className={ROW_TABLE}>
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-3 font-semibold">Giờ học</th>
            <th className="px-3 py-3 font-semibold">Tên lớp</th>
            <th className="px-3 py-3 font-semibold">Giáo viên</th>
            <th className="px-3 py-3 text-center font-semibold">Sĩ số</th>
            <th className="px-3 py-3 font-semibold">Tình trạng điểm danh</th>
            <th className="px-3 py-3">
              <span className="sr-only">Mở điểm danh</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = attendanceStatus(row, date, today)
            const cell = `${CELL} ${CELL_CLICKABLE} px-3 py-3`
            return (
              <tr
                key={`${row.class_id}|${row.start_time}`}
                onClick={() => onOpen(row.class_id, date)}
                className={`${ROW} cursor-pointer`}
              >
                <td className={`${cell} whitespace-nowrap font-semibold text-slate-800`}>
                  {formatTime(row.start_time)}
                  <span className="font-normal text-slate-400"> – </span>
                  {formatTime(row.end_time)}
                </td>
                <td className={cell}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(row.class_id, date)
                    }}
                    aria-label={`Mở điểm danh lớp ${row.name}`}
                    className={`rounded-lg px-2.5 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-300 ${subjectColor(row.subject)}`}
                  >
                    {classTitle(row)}
                  </button>
                </td>
                <td className={`${cell} font-semibold text-slate-800`}>
                  {row.teacher_name || 'Chưa gắn giáo viên'}
                </td>
                <td className={`${cell} text-center text-slate-700`}>{Number(row.total_count) || 0}</td>
                <td className={cell}>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONES[status.tone]}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className={`${cell} text-right`}>
                  <ChevronRight size={18} className="inline text-slate-400" aria-hidden="true" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}
