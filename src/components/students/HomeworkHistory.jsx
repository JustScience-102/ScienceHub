import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import EmptyState from '../EmptyState'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { floorLabel, formatScore, kindLabel, resultLabel, summarizeHomework } from '../../lib/homework'

// Tab "Lịch sử làm bài tập" trong hồ sơ học sinh: các bài học sinh đã làm trên app giao bài ScienceHub,
// bài mới nộp trước (RPC student_homework_history, file 10_sciencehub.sql). Dùng để báo cáo phụ huynh.
export default function HomeworkHistory({ studentId }) {
  const [state, setState] = useState({ key: '', rows: [], error: '' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('student_homework_history', { p_student_id: studentId })
      if (cancelled) return
      setState({ key: studentId, rows: error ? [] : (data ?? []), error: error ? toVietnameseError(error) : '' })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [studentId])

  if (state.key !== studentId) {
    return <p className="text-sm text-slate-500">Trung tâm đang tải lịch sử làm bài tập...</p>
  }
  if (state.error) {
    return <Notice type="error">{state.error}</Notice>
  }
  if (state.rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Học sinh chưa làm bài tập nào trên ScienceHub"
        text="Sau khi học sinh nộp bài trên app giao bài, điểm tự hiện ở đây."
      />
    )
  }

  const summary = summarizeHomework(state.rows)
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Số bài đã làm</dt>
          <dd className="text-lg font-semibold text-slate-800">{summary.total}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Điểm trung bình bài tại lớp</dt>
          <dd className="text-lg font-semibold text-slate-800">
            {summary.classAverage === null ? '—' : formatScore(summary.classAverage)}
            {summary.classCount > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-500">({summary.classCount} bài)</span>
            )}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-slate-500">Tháp đã qua hết các tầng</dt>
          <dd className="text-lg font-semibold text-slate-800">
            {summary.towerCount ? `${summary.towersDone}/${summary.towerCount}` : '—'}
          </dd>
        </div>
      </dl>

      <ul className="space-y-3">
        {state.rows.map((row) => (
          <li key={row.assignment_id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800">{row.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {[row.subject, kindLabel(row), row.last_submitted_at && `Nộp ${formatDate(row.last_submitted_at)}`, `${row.attempts} lượt`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <p className="shrink-0 text-right text-base font-semibold text-slate-800">{resultLabel(row)}</p>
            </div>
            {row.kind === 'tower' && Array.isArray(row.floors) && row.floors.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm text-slate-600">
                {row.floors.map((floor) => (
                  <li key={floor.floor}>{floorLabel(floor)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
