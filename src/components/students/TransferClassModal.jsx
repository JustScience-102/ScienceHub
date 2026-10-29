import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import ClassPickList from './ClassPickList'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { monthStartISO, todayISO } from '../../lib/schedule'
import { STATUS_LABELS } from '../../lib/tuition'
import { buildClassChoices, loadClassChoices, transferError } from '../../lib/transfer'
import { classTitle } from '../../lib/dashboard'

// Hộp thoại ĐỔI LỚP: học sinh rời lớp hiện tại và vào lớp mới CÙNG KHỐI trong một lần lưu.
// Ngày chuyển dùng chung: ngày cuối học lớp cũ = ngày vào lớp mới.
//  enrollment: ghi danh 'active' của lớp đang rời (có classes(...))
//  activeEnrollments: mọi ghi danh 'active' của học sinh (để xác định khối)
//  onDone(message): gọi sau khi lưu thành công
export default function TransferClassModal({
  enrollment,
  activeEnrollments,
  studentName,
  isTeacher = false,
  onDone,
  onClose,
}) {
  const today = todayISO()
  // Giáo viên không được lùi ngày chuyển về tháng trước (Database cũng chặn).
  const minDate =
    isTeacher && monthStartISO() > enrollment.joined_at ? monthStartISO() : enrollment.joined_at
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [date, setDate] = useState(today)
  const [later, setLater] = useState({ date: null, rows: [], error: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadClassChoices().then((result) => {
      if (cancelled) return
      if (result.error) setLoadError(result.error)
      else setData(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const dateValid = Boolean(date) && date >= minDate && date <= today

  // Điểm danh của lớp cũ nằm SAU ngày chuyển sẽ bị xóa nếu người dùng xác nhận.
  useEffect(() => {
    if (!dateValid) return undefined
    let cancelled = false
    supabase
      .from('attendance_records')
      .select('id, attendance_date, status, price_snapshot')
      .eq('enrollment_id', enrollment.id)
      .gt('attendance_date', date)
      .order('attendance_date', { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return
        setLater({ date, rows: error ? [] : rows, error: error ? toVietnameseError(error) : '' })
      })
    return () => {
      cancelled = true
    }
  }, [enrollment.id, date, dateValid])

  const choices = useMemo(() => {
    if (!data) return []
    const list = buildClassChoices({
      classes: data.classes,
      activeEnrollments,
      excludeClassIds: [enrollment.class_id],
    }).list
    if (!isTeacher) return list
    // Giáo viên: RLS đã chỉ trả lớp của chính mình; chỉ giữ thêm lớp cùng khối và cùng môn với lớp hiện tại.
    const current = enrollment.classes
    return list.filter(
      ({ cls }) =>
        (cls.subject ?? null) === (current?.subject ?? null) && (cls.grade ?? null) === (current?.grade ?? null),
    )
  }, [data, activeEnrollments, enrollment.class_id, enrollment.classes, isTeacher])

  const checking = dateValid && later.date !== date
  const rows = later.date === date ? later.rows : []
  const lostMoney = rows.reduce((sum, row) => sum + (row.price_snapshot ?? 0), 0)
  const target = choices.find((item) => item.cls.id === selectedId)?.cls ?? null

  let dateError = ''
  if (!date) dateError = 'Vui lòng chọn ngày chuyển lớp.'
  else if (date < enrollment.joined_at) {
    dateError = `Ngày chuyển không được sớm hơn ngày vào lớp cũ (${formatDate(enrollment.joined_at)}).`
  } else if (date < minDate) {
    dateError = `Giáo viên chỉ được chuyển lớp trong tháng hiện tại (từ ${formatDate(minDate)}).`
  } else if (date > today) dateError = 'Ngày chuyển không được ở tương lai.'

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!selectedId) {
      setFormError('Vui lòng chọn lớp muốn chuyển tới.')
      return
    }
    if (dateError) return

    setSaving(true)
    const { error } = await supabase.rpc('transfer_enrollment', {
      p_enrollment_id: enrollment.id,
      p_new_class_id: selectedId,
      p_date: date,
      p_delete_attendance: rows.length > 0,
    })
    setSaving(false)
    if (error) {
      setFormError(transferError(error))
      return
    }
    onDone(
      `Trung tâm đã chuyển ${studentName} từ lớp ${enrollment.classes ? classTitle(enrollment.classes) : ''} sang lớp ${target ? classTitle(target) : ''}.`,
    )
  }

  let content
  if (loadError) content = <Notice type="error">{loadError}</Notice>
  else if (!data) content = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách lớp...</p>
  else {
    content = (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Trung tâm sẽ chuyển <strong>{studentName}</strong> khỏi lớp <strong>{enrollment.classes ? classTitle(enrollment.classes) : ''}</strong> sang
          một lớp khác <strong>cùng khối</strong>. Lịch sử điểm danh và doanh thu của lớp cũ được giữ nguyên. Các buổi
          từ ngày chuyển trở đi tính theo đơn giá lớp mới.
        </p>

        {formError && <Notice type="error">{formError}</Notice>}

        {choices.length === 0 ? (
          <Notice type="info">
            {isTeacher
              ? 'Bạn chưa có lớp nào khác cùng khối và cùng môn để chuyển tới.'
              : 'Hiện chưa có lớp nào khác để chuyển tới.'}
          </Notice>
        ) : (
          <ClassPickList
            choices={choices}
            counts={data.counts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            idPrefix="transfer"
          />
        )}

        <div>
          <label htmlFor="transfer-date" className="mb-1 block text-sm font-medium text-slate-700">
            Ngày chuyển lớp
          </label>
          <input
            id="transfer-date"
            type="date"
            value={date}
            min={minDate}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={dateError ? 'true' : undefined}
            className={`min-h-11 w-full rounded-lg border px-3 text-base outline-none focus:ring-2 focus:ring-sky-200 sm:text-sm ${
              dateError ? 'border-red-400' : 'border-slate-300 focus:border-sky-400'
            }`}
          />
          {dateError ? (
            <p className="mt-1 text-xs text-red-600">{dateError}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Đây vừa là ngày học cuối ở lớp cũ, vừa là ngày vào lớp mới. Mặc định là hôm nay.
            </p>
          )}
        </div>

        {later.error && <Notice type="error">{later.error}</Notice>}
        {checking && <p className="text-sm text-slate-500">Trung tâm đang kiểm tra điểm danh...</p>}

        {rows.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              Lớp cũ có {rows.length} buổi điểm danh sau ngày chuyển sẽ bị xóa hẳn, không khôi phục được
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
            <p>Điểm danh từ ngày chuyển trở về trước không bị ảnh hưởng. Hoặc bạn có thể chọn ngày chuyển muộn hơn.</p>
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
            type="submit"
            disabled={saving || checking || Boolean(dateError) || Boolean(later.error) || choices.length === 0}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : rows.length > 0 ? 'Xóa các buổi này và đổi lớp' : 'Đổi lớp'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title={`Đổi lớp cho ${studentName}`} onClose={onClose}>
      {content}
    </Modal>
  )
}
