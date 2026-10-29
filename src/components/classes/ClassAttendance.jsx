import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Mic,
  Moon,
  Repeat,
  Square,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../EmptyState'
import Notice from '../Notice'
import MakeupModal from './MakeupModal'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { findSessionDate, hasSessionOn, latestSessionDate, todayISO, weekdayLabel } from '../../lib/schedule'
import { compareVietnameseNames } from '../../lib/text'
import { getSpeechRecognition, matchSpokenNames } from '../../lib/voice'
import { classTitle } from '../../lib/dashboard'

// Ba trạng thái điểm danh. Có mặt và Vắng đều TÍNH TIỀN; Có phép thì không.
const STATUSES = [
  {
    value: 'present',
    label: 'Có mặt',
    on: 'bg-emerald-500 text-white',
    off: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  {
    value: 'absent',
    label: 'Vắng',
    on: 'bg-red-500 text-white',
    off: 'bg-red-50 text-red-600 hover:bg-red-100',
  },
  {
    value: 'absent_excused',
    label: 'Có phép',
    on: 'bg-sky-500 text-white',
    off: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  },
]

const BTN =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const VOICE_ERRORS = {
  'not-allowed': 'Trình duyệt chưa được cấp quyền dùng micro. Hãy cho phép micro rồi thử lại.',
  'service-not-allowed': 'Trình duyệt chưa được cấp quyền dùng micro. Hãy cho phép micro rồi thử lại.',
  'no-speech': 'Trung tâm không nghe thấy giọng nói nào. Hãy thử lại gần micro hơn.',
  'audio-capture': 'Không tìm thấy micro trên thiết bị này.',
  'network': 'Không kết nối được dịch vụ nhận dạng giọng nói. Hãy kiểm tra mạng rồi thử lại.',
}

// Cập nhật danh sách bản ghi ngay trên giao diện theo đúng quy tắc đóng băng giá của save_attendance:
// - status === null: xóa bản ghi
// - status === 'absent_excused': price_snapshot = null
// - đổi present <-> absent khi đã có price_snapshot: giữ nguyên giá cũ
// - chấm mới hoặc từ absent_excused sang tính tiền: lấy giá hiện tại của lớp
// Máy chủ vẫn là nguồn đúng: khi hàng đợi lưu xong, danh sách được thay bằng dòng máy chủ trả về.
function applyOptimistic(records, items, rowByEnrollment, cls) {
  const itemByEnrollment = new Map(items.map((item) => [item.enrollment_id, item.status]))
  const next = []
  const handled = new Set()
  for (const rec of records) {
    if (!itemByEnrollment.has(rec.enrollment_id)) {
      next.push(rec)
      continue
    }
    handled.add(rec.enrollment_id)
    const status = itemByEnrollment.get(rec.enrollment_id)
    if (status === null) continue
    const price = status === 'absent_excused' ? null : (rec.price_snapshot ?? Number(cls.price_per_session ?? 0))
    next.push({ ...rec, status, price_snapshot: price })
  }
  for (const [enrollmentId, status] of itemByEnrollment.entries()) {
    if (handled.has(enrollmentId) || status === null) continue
    const row = rowByEnrollment.get(enrollmentId)
    if (!row) continue
    next.push({
      id: `temp-${enrollmentId}`,
      enrollment_id: enrollmentId,
      student_id: row.studentId,
      status,
      price_snapshot: status === 'absent_excused' ? null : Number(cls.price_per_session ?? 0),
      makeup_of_date: null,
      students: { full_name: row.name, student_code: row.code },
      class_enrollments: { class_id: cls.id, classes: { name: cls.name } },
    })
  }
  return next
}

// Dòng máy chủ trả về (không kèm tên) + phần tên/lớp đã có trên giao diện.
function mergeServerRows(serverRows, previous) {
  const byStudent = new Map(previous.map((rec) => [rec.student_id, rec]))
  return (serverRows ?? []).map((row) => ({ ...byStudent.get(row.student_id), ...row }))
}

// Điểm danh theo buổi của một lớp: chọn ngày có lịch học, đánh dấu từng học sinh,
// điểm danh hàng loạt, điểm danh bằng giọng nói và học bù.
// Mỗi lần bấm hiện ngay trên giao diện và được gửi lên máy chủ theo hàng đợi tuần tự (bấm liên tục được,
// thứ tự lưu đúng thứ tự bấm). Lịch học kiểm theo thời kỳ hiệu lực của ngày đang chọn.
export default function ClassAttendance({ cls, initialDate, isTeacher = false }) {
  const today = todayISO()
  const currentMonthPrefix = today.slice(0, 7)
  const [date, setDate] = useState(initialDate || today)
  const [metaState, setMetaState] = useState({ classId: '', schedules: [], enrollments: [], error: '' })
  const [recordState, setRecordState] = useState({ key: '', records: [], makeups: [], closed: false, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(0)
  const [makeup, setMakeup] = useState(false)
  const [cancelling, setCancelling] = useState(null) // { id, label } buổi học bù chờ xác nhận hủy
  const [cancelBusy, setCancelBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const recognitionRef = useRef(null)
  const queueRef = useRef(Promise.resolve())
  const pendingRef = useRef(0)
  const failedRef = useRef(false)
  const voiceSupported = Boolean(getSpeechRecognition())

  const recordKey = `${cls.id}|${date}`

  // Lịch học (mọi thời kỳ) và danh sách ghi danh của lớp: chỉ tải theo cls.id.
  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      const [scheduleResult, enrollResult] = await Promise.all([
        supabase.from('class_schedules').select('day_of_week, valid_from, valid_to').eq('class_id', cls.id),
        supabase
          .from('class_enrollments')
          .select('id, student_id, status, joined_at, left_at, students(id, student_code, full_name)')
          .eq('class_id', cls.id),
      ])
      if (cancelled) return
      const error = scheduleResult.error || enrollResult.error
      setMetaState({
        classId: cls.id,
        schedules: error ? [] : scheduleResult.data,
        enrollments: error ? [] : enrollResult.data,
        error: error ? toVietnameseError(error) : '',
      })
    }
    loadMeta()
    return () => {
      cancelled = true
    }
  }, [cls.id])

  // Bản ghi điểm danh của buổi đang chọn, các buổi học bù cho buổi này (ở lớp khác) và tình trạng khóa sổ.
  useEffect(() => {
    let cancelled = false
    async function loadRecords() {
      const [recordResult, makeupResult, closedResult] = await Promise.all([
        supabase
          .from('attendance_records')
          .select(
            'id, enrollment_id, student_id, status, price_snapshot, makeup_of_date, students(full_name, student_code), class_enrollments(class_id, classes(name, subject, grade, class_no))',
          )
          .eq('class_id', cls.id)
          .eq('attendance_date', date),
        supabase
          .from('attendance_records')
          .select('id, enrollment_id, attendance_date, classes(name, subject, grade, class_no), class_enrollments!inner(class_id)')
          .eq('makeup_of_date', date)
          .eq('class_enrollments.class_id', cls.id),
        supabase.from('month_closures').select('month_start').eq('month_start', `${date.slice(0, 7)}-01`),
      ])
      if (cancelled) return
      const error = recordResult.error || makeupResult.error || closedResult.error
      setRecordState({
        key: recordKey,
        records: error ? [] : recordResult.data,
        makeups: error ? [] : makeupResult.data,
        closed: !error && closedResult.data.length > 0,
        error: error ? toVietnameseError(error) : '',
      })
    }
    loadRecords()
    return () => {
      cancelled = true
    }
  }, [cls.id, date, recordKey, reloadKey])

  // Tắt micro khi rời màn hình điểm danh
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
  }, [])

  const reloadRecords = () => setReloadKey((value) => value + 1)
  const loading = metaState.classId !== cls.id || recordState.key !== recordKey
  const errorText = metaState.error || recordState.error
  const ready = !loading && !errorText

  const isFuture = date > today
  const isScheduled = ready && hasSessionOn(metaState.schedules, date)
  const editable = isScheduled && !isFuture
  // Tháng đã khóa sổ: không ai sửa (Database cũng chặn). Giáo viên: tháng trước chỉ được xem.
  const monthClosed = ready && recordState.closed
  const teacherLocked = isTeacher && date.slice(0, 7) < currentMonthPrefix
  const monthLocked = monthClosed || teacherLocked

  // Danh sách dòng điểm danh: học sinh của lớp có mặt trong khoảng thời gian học của ngày được chọn,
  // cộng thêm các học sinh học bù (bản ghi thuộc lớp này nhưng ghi danh ở lớp khác).
  // madeUp: buổi học bù (ở lớp khác) đã bù cho buổi này của học sinh.
  const rows = useMemo(() => {
    if (!ready) return []
    const recordByStudent = new Map(recordState.records.map((record) => [record.student_id, record]))
    const makeupByEnrollment = new Map(recordState.makeups.map((item) => [item.enrollment_id, item]))
    const list = []
    const seen = new Set()

    for (const enrollment of metaState.enrollments) {
      if (enrollment.joined_at > date) continue
      if (enrollment.left_at && enrollment.left_at < date) continue
      if (seen.has(enrollment.student_id)) continue
      seen.add(enrollment.student_id)
      list.push({
        key: enrollment.student_id,
        studentId: enrollment.student_id,
        enrollmentId: enrollment.id,
        name: enrollment.students?.full_name ?? '',
        code: enrollment.students?.student_code ?? '',
        record: recordByStudent.get(enrollment.student_id) ?? null,
        makeupFrom: '',
        madeUp: makeupByEnrollment.get(enrollment.id) ?? null,
      })
    }

    for (const record of recordState.records) {
      if (seen.has(record.student_id)) continue
      seen.add(record.student_id)
      const fromOtherClass = record.class_enrollments?.class_id !== cls.id
      list.push({
        key: record.student_id,
        studentId: record.student_id,
        enrollmentId: record.enrollment_id,
        name: record.students?.full_name ?? '',
        code: record.students?.student_code ?? '',
        record,
        makeupFrom: fromOtherClass
          ? record.class_enrollments?.classes
            ? classTitle(record.class_enrollments.classes)
            : 'lớp khác'
          : '',
        madeUp: null,
      })
    }

    return list.sort((a, b) => compareVietnameseNames(a.name, b.name))
  }, [ready, metaState.enrollments, recordState.records, recordState.makeups, date, cls.id])

  const summary = useMemo(() => {
    const result = { present: 0, absent: 0, absent_excused: 0, unmarked: 0, money: 0 }
    for (const row of rows) {
      if (!row.record) {
        result.unmarked += 1
        continue
      }
      result[row.record.status] += 1
      result.money += row.record.price_snapshot ?? 0
    }
    return result
  }, [rows])

  // ---- Chọn ngày ----
  function changeDate(next) {
    if (!next) return
    stopVoice(true)
    setNotice(null)
    setDate(next)
  }

  const schedules = metaState.classId === cls.id ? metaState.schedules : []
  const previousDate = findSessionDate(schedules, date, -1)
  const nextDate = findSessionDate(schedules, date, 1, today)
  const latestDate = schedules.length > 0 ? latestSessionDate(schedules, today) : null

  // ---- Lưu điểm danh: hiển thị ngay, gửi lên máy chủ theo hàng đợi tuần tự ----
  function saveItems(items, successText) {
    const rowByEnrollment = new Map(rows.map((row) => [row.enrollmentId, row]))
    const key = recordKey
    const saveDate = date
    setRecordState((prev) =>
      prev.key === key ? { ...prev, records: applyOptimistic(prev.records, items, rowByEnrollment, cls) } : prev,
    )
    setNotice(null)
    pendingRef.current += 1
    setPending(pendingRef.current)

    queueRef.current = queueRef.current.then(async () => {
      const { data, error } = await supabase.rpc('save_attendance', {
        p_class_id: cls.id,
        p_date: saveDate,
        p_items: items,
      })
      pendingRef.current -= 1
      setPending(pendingRef.current)
      if (error) {
        failedRef.current = true
        setNotice({ type: 'error', text: toVietnameseError(error) })
      } else if (successText) {
        setNotice({ type: 'success', text: successText })
      }
      if (pendingRef.current > 0) return
      if (failedRef.current) {
        failedRef.current = false
        reloadRecords()
      } else {
        setRecordState((prev) => (prev.key === key ? { ...prev, records: mergeServerRows(data, prev.records) } : prev))
      }
    })
    return queueRef.current
  }

  const setStatus = (row, status) => saveItems([{ enrollment_id: row.enrollmentId, status }])

  const clearStatus = (row) => saveItems([{ enrollment_id: row.enrollmentId, status: null }])

  function markAllUnmarked(status, successText) {
    const items = rows
      .filter((row) => !row.record)
      .map((row) => ({ enrollment_id: row.enrollmentId, status }))
    if (items.length === 0) {
      setNotice({ type: 'info', text: 'Mọi học sinh trong buổi này đã được điểm danh.' })
      return
    }
    saveItems(items, successText(items.length))
  }

  // ---- Hủy học bù ----
  async function confirmCancelMakeup() {
    setCancelBusy(true)
    const { error } = await supabase.rpc('cancel_makeup', { p_record_id: cancelling.id })
    setCancelBusy(false)
    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } else {
      setNotice({
        type: 'success',
        text: `Trung tâm đã hủy học bù ${cancelling.label}. Buổi gốc đã trở lại như trước khi bù.`,
      })
      reloadRecords()
    }
    setCancelling(null)
  }

  // ---- Giọng nói ----
  function stopVoice(abort = false) {
    const recognition = recognitionRef.current
    if (recognition) {
      if (abort) recognition.abort()
      else recognition.stop()
    }
    if (abort) {
      setListening(false)
      setHeard('')
      setVoiceError('')
    }
  }

  function startVoice() {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return
    setNotice(null)
    setVoiceError('')
    setHeard('')

    const recognition = new Recognition()
    recognition.lang = 'vi-VN'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      let added = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) added += ` ${event.results[index][0].transcript}`
      }
      if (added) setHeard((current) => `${current} ${added}`.trim())
    }
    recognition.onerror = (event) => {
      setVoiceError(VOICE_ERRORS[event.error] ?? 'Điểm danh giọng nói gặp lỗi. Hãy thử lại.')
    }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    setListening(true)
    try {
      recognition.start()
    } catch {
      setListening(false)
      setVoiceError('Không bật được micro. Hãy thử lại.')
    }
  }

  const voiceResult = useMemo(() => {
    if (listening || !heard) return null
    const candidates = rows.map((row) => ({ key: row.key, name: row.name }))
    return matchSpokenNames(heard, candidates)
  }, [listening, heard, rows])

  const matchedRows = voiceResult ? rows.filter((row) => voiceResult.matched.includes(row.key)) : []

  async function confirmVoice() {
    if (matchedRows.length === 0) return
    const items = matchedRows.map((row) => ({ enrollment_id: row.enrollmentId, status: 'present' }))
    setHeard('')
    await saveItems(items, `Trung tâm đã điểm danh Có mặt cho ${items.length} học sinh theo giọng nói.`)
  }

  function handleMakeupDone(message) {
    setMakeup(false)
    setNotice({ type: 'success', text: message })
    reloadRecords()
  }

  // ---- Giao diện ----
  const dateBar = (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => previousDate && changeDate(previousDate)}
          disabled={!previousDate}
          aria-label="Buổi học trước"
          className={`${BTN} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(event) => changeDate(event.target.value)}
          aria-label="Ngày điểm danh"
          className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:flex-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => nextDate && changeDate(nextDate)}
          disabled={!nextDate}
          aria-label="Buổi học sau"
          className={`${BTN} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-700">
          {weekdayLabel(date)}, {formatDate(date)}
        </p>
        {latestDate && latestDate !== date && (
          <button
            type="button"
            onClick={() => changeDate(latestDate)}
            className={`${BTN} bg-sky-50 text-sky-700 hover:bg-sky-100`}
          >
            Buổi gần nhất
          </button>
        )}
      </div>
    </div>
  )

  let body
  if (loading) {
    body = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách điểm danh...</p>
  } else if (errorText) {
    body = <Notice type="error">{errorText}</Notice>
  } else if (isFuture) {
    body = (
      <Notice type="info">
        Trung tâm không điểm danh cho ngày trong tương lai. Hãy chọn ngày từ hôm nay trở về trước.
      </Notice>
    )
  } else if (!isScheduled) {
    body = (
      <Notice type="info">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Lớp {classTitle(cls)} không có lịch học vào {weekdayLabel(date)}. Hãy chọn đúng ngày có lịch học của lớp
            {latestDate ? ' hoặc chuyển tới buổi gần nhất.' : '.'} Học sinh học bù ở lớp khác thì mở lớp mà học sinh đó
            đến học bù.
          </span>
          {latestDate && latestDate !== date && (
            <button
              type="button"
              onClick={() => changeDate(latestDate)}
              className={`${BTN} shrink-0 bg-sky-600 text-white hover:bg-sky-700`}
            >
              Tới buổi gần nhất ({formatDate(latestDate)})
            </button>
          )}
        </div>
      </Notice>
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={Users}
        title="Buổi này chưa có học sinh nào"
        text="Chưa có học sinh nào đang học lớp vào ngày này. Bạn có thể thêm học sinh học bù."
      />
    )
  } else {
    body = (
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {rows.map((row) => {
          const unmarked = !row.record
          const isMakeupRow = Boolean(row.record?.makeup_of_date || row.madeUp)
          return (
            <li
              key={row.key}
              className={`flex flex-col gap-3 p-4 transition-colors md:flex-row md:items-center md:justify-between ${
                unmarked ? 'border-l-4 border-l-amber-400 bg-amber-50/20' : 'bg-white'
              }`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2 md:block">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  <span>{row.name}</span>
                  {unmarked && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      Chưa chấm
                    </span>
                  )}
                  {row.makeupFrom && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Học bù từ lớp {row.makeupFrom}
                      {row.record?.makeup_of_date && ` (bù buổi ${formatDate(row.record.makeup_of_date)})`}
                    </span>
                  )}
                  {row.madeUp && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Đã học bù ngày {formatDate(row.madeUp.attendance_date)}
                      {row.madeUp.classes ? ` tại lớp ${classTitle(row.madeUp.classes)}` : ''}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {row.code}
                  {row.record &&
                    row.record.status !== 'absent_excused' &&
                    ` · Tính ${formatCurrency(row.record.price_snapshot)}`}
                  {row.record?.status === 'absent_excused' && ' · Không tính tiền'}
                </p>
              </div>
              {row.record && !isMakeupRow && (
                // Điện thoại: nút xóa chỉ còn biểu tượng ở góc tên để 3 nút trạng thái nằm đủ một hàng.
                <button
                  type="button"
                  onClick={() => clearStatus(row)}
                  disabled={monthLocked}
                  aria-label={`Xóa điểm danh của ${row.name}`}
                  className={`${BTN} -mr-1 -mt-1 !px-0 h-11 w-11 shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200 md:hidden`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
              </div>
              {isMakeupRow ? (
                // Buổi học bù và buổi gốc đã được bù chỉ thay đổi bằng "Hủy học bù" (trả buổi gốc về như cũ).
                <div className="flex flex-wrap items-center gap-2">
                  {row.record && (
                    <span className="text-sm text-slate-500">
                      {STATUSES.find((status) => status.value === row.record.status)?.label}
                    </span>
                  )}
                  {!monthLocked && (
                    <button
                      type="button"
                      onClick={() =>
                        setCancelling({
                          id: row.madeUp ? row.madeUp.id : row.record.id,
                          label: `của ${row.name}`,
                        })
                      }
                      className={`${BTN} bg-amber-50 text-amber-700 hover:bg-amber-100`}
                    >
                      <Undo2 size={16} aria-hidden="true" />
                      Hủy học bù
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-center">
                  {STATUSES.map((status) => {
                    const active = row.record?.status === status.value
                    return (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => setStatus(row, status.value)}
                        disabled={active || monthLocked}
                        aria-pressed={active}
                        aria-label={`${status.label}: ${row.name}`}
                        className={`${BTN} ${active ? status.on : status.off}`}
                      >
                        {active && <Check size={16} aria-hidden="true" />}
                        {status.label}
                      </button>
                    )
                  })}
                  {row.record && (
                    <button
                      type="button"
                      onClick={() => clearStatus(row)}
                      disabled={monthLocked}
                      aria-label={`Xóa điểm danh của ${row.name}`}
                      className={`${BTN} bg-slate-100 text-slate-600 hover:bg-slate-200 max-md:hidden`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span className="md:sr-only">Xóa</span>
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  // Tháng đã khóa (khóa sổ, hoặc tháng trước với Giáo viên): ẩn công cụ hàng loạt, giọng nói và nút Học bù.
  const tools =
    editable && ready && !monthLocked ? (
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <button
          type="button"
          onClick={() =>
            markAllUnmarked(
              'present',
              (count) => `Trung tâm đã đánh dấu Có mặt cho ${count} học sinh chưa điểm danh.`,
            )
          }
          disabled={listening}
          className={`${BTN} bg-emerald-500 text-white hover:bg-emerald-600`}
        >
          <CheckCheck size={18} aria-hidden="true" />
          Tất cả có mặt
        </button>
        <button
          type="button"
          onClick={() =>
            markAllUnmarked(
              'absent_excused',
              (count) => `Trung tâm đã đánh dấu Vắng có phép cho ${count} học sinh chưa điểm danh.`,
            )
          }
          disabled={listening}
          className={`${BTN} bg-sky-50 text-sky-700 hover:bg-sky-100`}
        >
          <Moon size={18} aria-hidden="true" />
          Nghỉ (cả lớp có phép)
        </button>
        {voiceSupported &&
          (listening ? (
            <button
              type="button"
              onClick={() => stopVoice()}
              className={`${BTN} bg-red-500 text-white hover:bg-red-600`}
            >
              <Square size={16} aria-hidden="true" />
              Dừng nghe
            </button>
          ) : (
            <button
              type="button"
              onClick={startVoice}
              className={`${BTN} bg-slate-100 text-slate-700 hover:bg-slate-200`}
            >
              <Mic size={18} aria-hidden="true" />
              Điểm danh giọng nói
            </button>
          ))}
        <button
          type="button"
          onClick={() => {
            stopVoice(true)
            setNotice(null)
            setMakeup(true)
          }}
          className={`${BTN} bg-amber-50 text-amber-700 hover:bg-amber-100`}
        >
          <Repeat size={18} aria-hidden="true" />
          Học bù
        </button>
      </div>
    ) : null

  return (
    <div className="space-y-4">
      {dateBar}

      {monthClosed && (
        <Notice type="info">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={16} aria-hidden="true" />
            Tháng {date.slice(5, 7)}/{date.slice(0, 4)} đã chốt sổ nên không thể sửa điểm danh.
            {isTeacher ? ' Hãy liên hệ Quản lý nếu cần sửa.' : ' Muốn sửa, hãy mở lại sổ ở Tổng quan → Sao lưu & Năm học.'}
          </span>
        </Notice>
      )}
      {!monthClosed && teacherLocked && (
        <Notice type="info">
          Tháng trước chỉ Quản lý sửa được. Giáo viên chỉ có thể xem lại lịch sử điểm danh của tháng này.
        </Notice>
      )}
      {pending > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Trung tâm đang lưu {pending} thay đổi...
        </p>
      )}

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {tools}

      {editable && rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-xs text-slate-500">Có mặt</dt>
            <dd className="font-semibold text-emerald-700">{summary.present}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Vắng</dt>
            <dd className="font-semibold text-red-600">{summary.absent}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Có phép</dt>
            <dd className="font-semibold text-sky-700">{summary.absent_excused}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Chưa điểm danh</dt>
            <dd className={`font-semibold ${summary.unmarked > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {summary.unmarked}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-slate-500">Tiền buổi học</dt>
            <dd className="font-semibold text-slate-800">{formatCurrency(summary.money)}</dd>
          </div>
        </dl>
      )}

      {listening && (
        <Notice type="info">
          Trung tâm đang nghe. Hãy đọc lần lượt tên các học sinh có mặt, xong bấm "Dừng nghe".
          {heard && <span className="mt-1 block text-slate-600">Đã nghe: {heard}</span>}
        </Notice>
      )}
      {voiceError && (
        <Notice type="error" onClose={() => setVoiceError('')}>
          {voiceError}
        </Notice>
      )}
      {voiceResult && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
          <p className="text-slate-600">Đã nghe: “{heard}”</p>
          {matchedRows.length > 0 ? (
            <p className="text-slate-800">
              Nhận ra {matchedRows.length} học sinh:{' '}
              <strong>{matchedRows.map((row) => row.name).join(', ')}</strong>
            </p>
          ) : (
            <p className="text-slate-800">Trung tâm chưa nhận ra tên học sinh nào trong lớp.</p>
          )}
          {voiceResult.ambiguous.length > 0 && (
            <p className="text-amber-700">
              Tên trùng nhau nên chưa tự chọn, hãy bấm tay:{' '}
              {voiceResult.ambiguous.map((item) => item.names.join(' / ')).join('; ')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmVoice}
              disabled={matchedRows.length === 0}
              className={`${BTN} bg-emerald-500 text-white hover:bg-emerald-600`}
            >
              <Check size={16} aria-hidden="true" />
              Xác nhận Có mặt ({matchedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setHeard('')}
              className={`${BTN} bg-slate-100 text-slate-700 hover:bg-slate-200`}
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {body}

      {cancelling && (
        <ConfirmDialog
          title="Hủy học bù"
          message={`Trung tâm sẽ xóa buổi học bù ${cancelling.label} và trả buổi gốc về đúng trạng thái trước khi bù (kể cả tiền học). Bạn có chắc không?`}
          confirmLabel="Hủy học bù"
          busy={cancelBusy}
          onConfirm={confirmCancelMakeup}
          onCancel={() => setCancelling(null)}
        />
      )}

      {makeup && (
        <MakeupModal
          cls={cls}
          date={date}
          isTeacher={isTeacher}
          onDone={handleMakeupDone}
          onClose={() => setMakeup(false)}
        />
      )}
    </div>
  )
}