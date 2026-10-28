import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { monthStartISO, todayISO } from '../../lib/schedule'

const STATUS_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng',
  absent_excused: 'Vắng có phép',
}

// Hộp thoại cho học sinh nghỉ khỏi lớp (xóa mềm: status = 'dropped' + left_at).
// Nếu đã có điểm danh SAU ngày nghỉ, liệt kê các buổi đó và chỉ xóa khi người dùng xác nhận.
//   onConfirm(leftAt, deleteAttendance) -> trả về câu báo lỗi hoặc ''
export default function DropEnrollmentDialog({
  enrollment,
  isLastClass = false,
  isTeacher = false,
  studentName,
  className,
  onConfirm,
  onClose,
}) {
  const today = todayISO()
  // Giáo viên chỉ được chọn ngày nghỉ từ đầu tháng hiện tại (Database cũng chặn).
  const minDate = isTeacher && monthStartISO() > enrollment.joined_at ? monthStartISO() : enrollment.joined_at
  const [leftAt, setLeftAt] = useState(today)
  const [later, setLater] = useState({ date: null, rows: [], error: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const dateValid = Boolean(leftAt) && leftAt >= minDate && leftAt <= today

  // Tải các buổi điểm danh nằm sau ngày nghỉ đang chọn.
  useEffect(() => {
    if (!supabase || !dateValid) return undefined
    let cancelled = false
    supabase
      .from('attendance_records')
      .select('id, attendance_date, status, price_snapshot')
      .eq('enrollment_id', enrollment.id)
      .gt('attendance_date', leftAt)
      .order('attendance_date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        setLater({
          date: leftAt,
          rows: error ? [] : data,
          error: error ? toVietnameseError(error) : '',
        })
      })
    return () => {
      cancelled = true
    }
  }, [enrollment.id, leftAt, dateValid])

  const loading = dateValid && later.date !== leftAt
  const rows = later.date === leftAt ? later.rows : []
  const lostMoney = rows.reduce((sum, row) => sum + (row.price_snapshot ?? 0), 0)

  let dateError = ''
  if (!leftAt) dateError = 'Vui lòng chọn ngày nghỉ.'
  else if (leftAt < enrollment.joined_at) {
    dateError = `Ngày nghỉ không được sớm hơn ngày vào lớp (${formatDate(enrollment.joined_at)}).`
  } else if (leftAt < minDate) {
    dateError = `Giáo viên chỉ được chọn ngày nghỉ trong tháng hiện tại (từ ${formatDate(minDate)}).`
  } else if (leftAt > today) dateError = 'Ngày nghỉ không được ở tương lai.'

  async function handleConfirm() {
    setSaving(true)
    setFormError('')
    const message = await onConfirm(leftAt, rows.length > 0)
    setSaving(false)
    if (message) setFormError(message)
  }

  const needsDelete = rows.length > 0

  return (
    <Modal title="Cho học sinh nghỉ khỏi lớp" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Trung tâm sẽ cho <strong>{studentName}</strong> nghỉ hẳn khỏi lớp <strong>{className}</strong>.
          Học sinh chuyển sang trạng thái "Đã nghỉ", lịch sử điểm danh và doanh thu của các buổi đã học vẫn được giữ.
        </p>

        {isLastClass && (
          <Notice type="info">
            Đây là lớp cuối cùng của {studentName}. Sau khi cho nghỉ, học sinh sẽ tự ẩn khỏi danh sách học sinh và
            được tính là học sinh nghỉ hẳn khỏi Trung tâm. Học sinh hiện lại khi được thêm vào một lớp.
          </Notice>
        )}

        {isTeacher && (
          <Notice type="info">
            Nếu đây là lớp cuối cùng của {studentName} tại Trung tâm, học sinh sẽ tự ẩn khỏi danh sách học sinh và
            hiện lại khi được thêm vào một lớp.
          </Notice>
        )}

        {formError && <Notice type="error">{formError}</Notice>}

        <div>
          <label htmlFor="drop-left-at" className="mb-1 block text-sm font-medium text-slate-700">
            Ngày nghỉ (ngày cuối cùng học sinh còn học)
          </label>
          <input
            id="drop-left-at"
            type="date"
            value={leftAt}
            min={minDate}
            max={today}
            onChange={(event) => setLeftAt(event.target.value)}
            aria-invalid={dateError ? 'true' : undefined}
            className={`min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200 ${
              dateError ? 'border-red-400' : 'border-slate-300 focus:border-sky-400'
            }`}
          />
          {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
        </div>

        {later.error && <Notice type="error">{later.error}</Notice>}
        {loading && <p className="text-sm text-slate-500">Trung tâm đang kiểm tra điểm danh...</p>}

        {needsDelete && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              Có {rows.length} buổi điểm danh sau ngày nghỉ sẽ bị xóa hẳn, không khôi phục được
              {lostMoney > 0 ? ` (mất ${formatCurrency(lostMoney)} doanh thu)` : ''}:
            </p>
            <ul className="max-h-40 divide-y divide-amber-100 overflow-y-auto rounded bg-white/60">
              {rows.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 px-3 py-1.5">
                  <span>{formatDate(row.attendance_date)}</span>
                  <span>
                    {STATUS_LABELS[row.status] ?? row.status}
                    {row.price_snapshot != null ? ` · ${formatCurrency(row.price_snapshot)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p>Điểm danh từ ngày nghỉ trở về trước không bị ảnh hưởng. Hoặc bạn có thể đổi ngày nghỉ muộn hơn.</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || loading || Boolean(dateError) || Boolean(later.error)}
            className="min-h-11 rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {saving ? 'Đang xử lý...' : needsDelete ? 'Xóa các buổi này và cho nghỉ' : 'Cho nghỉ'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
