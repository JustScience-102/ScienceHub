import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import SelectField from '../SelectField'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { addDaysISO, hasSessionOn, monthStartISO, weekdayLabel } from '../../lib/schedule'
import { compareVietnameseNames } from '../../lib/text'
import { classTitle } from '../../lib/dashboard'

// Hộp thoại "Học bù": học sinh của một lớp KHÁC (cùng giáo viên) đến học bù ở lớp đang mở.
// Chọn lớp gốc -> chọn học sinh -> chọn buổi gốc được bù.
// Kết quả: lớp đang mở có 1 lượt "Có mặt" (tính tiền theo đơn giá đã đóng băng của buổi gốc, hoặc đơn giá
// hiện tại của lớp gốc nếu buổi gốc chưa tính tiền); buổi gốc tự chuyển thành "Vắng có phép".
// Mỗi buổi gốc chỉ được bù một lần; "Hủy học bù" ở màn hình điểm danh trả buổi gốc về như cũ.
export default function MakeupModal({ cls, date, isTeacher = false, onDone, onClose }) {
  const [classes, setClasses] = useState(null)
  const [classId, setClassId] = useState('')
  const [detail, setDetail] = useState(null) // { classId, scheduleRows, enrollments }
  const [history, setHistory] = useState(null) // { enrollmentId, records } các buổi đã có của ghi danh đã chọn
  const [enrollmentId, setEnrollmentId] = useState('')
  const [originalDate, setOriginalDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Các lớp khác cùng giáo viên
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: loadError } = await supabase
        .from('classes')
        .select('id, name, subject, grade, class_no')
        .eq('teacher_id', cls.teacher_id)
        .neq('id', cls.id)
        .is('deleted_at', null)
      if (cancelled) return
      if (loadError) {
        setError(toVietnameseError(loadError))
        setClasses([])
      } else {
        setClasses([...data].sort((a, b) => compareVietnameseNames(classTitle(a), classTitle(b))))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [cls.id, cls.teacher_id])

  // Lịch và học sinh đang học của lớp gốc đã chọn
  useEffect(() => {
    if (!classId) return undefined
    let cancelled = false
    async function load() {
      const [scheduleResult, enrollResult] = await Promise.all([
        supabase.from('class_schedules').select('day_of_week, valid_from, valid_to').eq('class_id', classId),
        supabase
          .from('class_enrollments')
          .select('id, joined_at, left_at, students(full_name, student_code)')
          .eq('class_id', classId)
          .eq('status', 'active'),
      ])
      if (cancelled) return
      const loadError = scheduleResult.error || enrollResult.error
      if (loadError) {
        setError(toVietnameseError(loadError))
        setDetail({ classId, scheduleRows: [], enrollments: [] })
      } else {
        setError('')
        setDetail({
          classId,
          scheduleRows: scheduleResult.data,
          enrollments: enrollResult.data,
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [classId])

  const loadingDetail = Boolean(classId) && detail?.classId !== classId
  const readyDetail = !loadingDetail && detail?.classId === classId ? detail : null

  const students = useMemo(() => {
    if (!readyDetail) return []
    return readyDetail.enrollments
      .filter((row) => row.joined_at <= date)
      .sort((a, b) => compareVietnameseNames(a.students?.full_name, b.students?.full_name))
  }, [readyDetail, date])

  const selectedEnrollment = students.find((row) => row.id === enrollmentId) ?? null

  // Các buổi đã có của học sinh đã chọn: bỏ khỏi danh sách buổi gốc đã Có mặt hoặc đã được bù.
  useEffect(() => {
    if (!enrollmentId) return undefined
    let cancelled = false
    supabase
      .from('attendance_records')
      .select('attendance_date, status, class_id, makeup_of_date')
      .eq('enrollment_id', enrollmentId)
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) setError(toVietnameseError(loadError))
        setHistory({ enrollmentId, records: loadError ? [] : data })
      })
    return () => {
      cancelled = true
    }
  }, [enrollmentId])

  const blockedOriginals = useMemo(() => {
    const blocked = new Set()
    if (!history || history.enrollmentId !== enrollmentId) return blocked
    for (const record of history.records) {
      if (record.makeup_of_date) blocked.add(record.makeup_of_date)
      if (record.class_id === classId && record.status === 'present') blocked.add(record.attendance_date)
    }
    return blocked
  }, [history, enrollmentId, classId])

  // Các buổi của lớp gốc có thể được bù: từ 4 tuần trước đến 2 tuần sau ngày học bù, đúng lịch lớp gốc
  // của ngày đó, trong thời gian học sinh học lớp gốc, chưa Có mặt và chưa được bù.
  const originalOptions = useMemo(() => {
    if (!readyDetail || !selectedEnrollment) return []
    const list = []
    for (let offset = -28; offset <= 14; offset += 1) {
      const candidate = addDaysISO(date, offset)
      if (!hasSessionOn(readyDetail.scheduleRows, candidate)) continue
      if (blockedOriginals.has(candidate)) continue
      // Giáo viên chỉ được bù cho buổi gốc trong tháng hiện tại (Database cũng chặn).
      if (isTeacher && candidate < monthStartISO()) continue
      if (candidate < selectedEnrollment.joined_at) continue
      if (selectedEnrollment.left_at && candidate > selectedEnrollment.left_at) continue
      list.push(candidate)
    }
    return list
  }, [readyDetail, selectedEnrollment, date, isTeacher, blockedOriginals])

  // Gợi ý sẵn buổi gần ngày học bù nhất (ưu tiên buổi đã qua).
  const defaultOriginal = useMemo(() => {
    const past = originalOptions.filter((item) => item <= date)
    return past.length > 0 ? past[past.length - 1] : (originalOptions[0] ?? '')
  }, [originalOptions, date])
  const effectiveOriginal = originalOptions.includes(originalDate) ? originalDate : defaultOriginal

  async function handleSubmit(event) {
    event.preventDefault()
    if (!classId || !selectedEnrollment || !effectiveOriginal) {
      setError('Vui lòng chọn lớp gốc, học sinh và buổi được bù.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('record_makeup', {
      p_makeup_class_id: cls.id,
      p_date: date,
      p_enrollment_id: selectedEnrollment.id,
      p_original_date: effectiveOriginal,
    })
    setBusy(false)
    if (rpcError) {
      setError(toVietnameseError(rpcError))
      return
    }
    const originalClass = classes.find((item) => item.id === classId)
    const originalName = originalClass ? classTitle(originalClass) : 'lớp gốc'
    onDone(
      `Trung tâm đã ghi nhận ${selectedEnrollment.students?.full_name} học bù ngày ${formatDate(date)} ` +
        `(${formatCurrency(data?.price)}). Buổi ngày ${formatDate(effectiveOriginal)} của lớp ${originalName} ` +
        'đã chuyển thành Vắng có phép.',
    )
  }

  let noClassText = ''
  if (classes && classes.length === 0) {
    noClassText = 'Giáo viên của lớp này chưa phụ trách lớp nào khác để học bù.'
  }

  return (
    <Modal title={`Học bù vào lớp ${classTitle(cls)}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Ngày học bù: <strong>{weekdayLabel(date)}, {formatDate(date)}</strong>. Học bù tính tiền theo
          đơn giá của buổi gốc; mỗi buổi gốc chỉ được bù một lần.
        </p>

        {error && <Notice type="error">{error}</Notice>}
        {noClassText && <Notice type="info">{noClassText}</Notice>}

        <SelectField
          id="makeup-class"
          label="Lớp gốc của học sinh (cùng giáo viên)"
          value={classId}
          onChange={(value) => {
            setClassId(value)
            setEnrollmentId('')
            setOriginalDate('')
            setError('')
          }}
          disabled={!classes || classes.length === 0}
          placeholder={classes ? 'Chọn lớp gốc' : 'Đang tải...'}
          required
        >
          {(classes ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {classTitle(item)}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="makeup-student"
          label="Học sinh"
          value={enrollmentId}
          onChange={(value) => {
            setEnrollmentId(value)
            setOriginalDate('')
          }}
          disabled={!readyDetail}
          placeholder={loadingDetail ? 'Đang tải...' : 'Chọn học sinh'}
          hint={readyDetail && students.length === 0 ? 'Lớp này chưa có học sinh đang học.' : undefined}
          required
        >
          {students.map((row) => (
            <option key={row.id} value={row.id}>
              {row.students?.full_name} ({row.students?.student_code})
            </option>
          ))}
        </SelectField>

        <SelectField
          id="makeup-original"
          label="Buổi của lớp gốc được bù (sẽ chuyển thành Vắng có phép)"
          value={effectiveOriginal}
          onChange={setOriginalDate}
          disabled={!selectedEnrollment}
          placeholder="Chọn buổi được bù"
          hint={
            selectedEnrollment && originalOptions.length === 0
              ? 'Không có buổi nào của lớp gốc phù hợp trong khoảng thời gian gần đây.'
              : undefined
          }
          required
        >
          {originalOptions.map((item) => (
            <option key={item} value={item}>
              {weekdayLabel(item)}, {formatDate(item)}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy || !selectedEnrollment || !effectiveOriginal}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? 'Đang lưu...' : 'Ghi nhận học bù'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
