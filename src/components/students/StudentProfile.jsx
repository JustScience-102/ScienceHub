import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRightLeft, ChevronLeft, ChevronRight, CalendarX, History, Plus } from 'lucide-react'
import PageShell from '../PageShell'
import AuditLogModal from '../audit/AuditLogModal'
import EmptyState from '../EmptyState'
import Notice from '../Notice'
import TransferClassModal from './TransferClassModal'
import AddClassModal from './AddClassModal'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { addDaysISO, formatSchedule, todayISO, weekdayLabel } from '../../lib/schedule'
import { fetchClassVersions, labelClassOn } from '../../lib/classVersions'
import { classGrade } from '../../lib/grade'
import { classTitle } from '../../lib/dashboard'
import {
  STATUS_LABELS,
  monthOf,
  monthStart,
  nextMonthStart,
  shiftMonth,
  monthLabel,
  sameMonth,
  summarizeMonth,
  remainingSessions,
} from '../../lib/tuition'

const STATUS_STYLES = {
  present: 'bg-emerald-50 text-emerald-700',
  absent: 'bg-red-50 text-red-700',
  absent_excused: 'bg-slate-100 text-slate-600',
}

const NAV_BTN =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

function teacherOf(cls) {
  return cls?.teachers?.full_name || 'Chưa gắn giáo viên'
}

function gradeText(cls) {
  const grade = classGrade(cls)
  return grade ? `Khối ${grade}` : 'Chưa có khối'
}

// Hồ sơ chi tiết học sinh: lớp đang học, giáo viên, lịch học, lịch sử điểm danh theo tháng
// và tổng học phí dự kiến (chỉ cộng price_snapshot đã đóng băng lúc điểm danh).
export default function StudentProfile({ studentId, onBack, isTeacher = false }) {
  const today = todayISO()
  const currentMonth = monthOf(today)
  const [month, setMonth] = useState(currentMonth)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [recordsState, setRecordsState] = useState({ key: '', rows: [], error: '' })
  // Đổi lớp / đăng ký thêm lớp: hộp thoại đang mở, thông báo kết quả và khóa tải lại hồ sơ.
  const [transferring, setTransferring] = useState(null) // ghi danh đang được đổi lớp
  const [addingClass, setAddingClass] = useState(false)
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [studentAuditOpen, setStudentAuditOpen] = useState(false)
  // Lịch sử nhãn lớp (V2-6): tên lớp, khối, giáo viên đúng vào ngày điểm danh. Lỗi tải thì dùng nhãn hiện tại.
  const [versions, setVersions] = useState([])

  const recordsKey = `${studentId}|${monthStart(month)}`

  // Thông tin học sinh và toàn bộ ghi danh (kể cả lớp đã nghỉ): tải một lần.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [studentResult, enrollmentResult] = await Promise.all([
        supabase
          .from('students')
          .select('*, parents(id, parent_code, full_name, phone)')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('class_enrollments')
          .select(
            'id, class_id, status, joined_at, left_at, classes(id, name, subject, grade, price_per_session, teachers(full_name), class_schedules(day_of_week, start_time, end_time))',
          )
          .eq('student_id', studentId),
      ])
      if (cancelled) return
      const error = studentResult.error || enrollmentResult.error
      if (error) {
        setProfileError(toVietnameseError(error))
      } else if (!studentResult.data) {
        setProfileError('Trung tâm không tìm thấy học sinh này.')
      } else {
        setProfile({ student: studentResult.data, enrollments: enrollmentResult.data })
        setProfileError('')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [studentId, reloadKey])

  // Điểm danh của tháng đang xem: tải lại khi đổi tháng. Biên [ngày 1, ngày 1 tháng sau).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, enrollment_id, class_id, attendance_date, status, price_snapshot, classes(name)')
        .eq('student_id', studentId)
        .gte('attendance_date', monthStart(month))
        .lt('attendance_date', nextMonthStart(month))
      if (cancelled) return
      setRecordsState((prev) => ({
        key: `${studentId}|${monthStart(month)}`,
        rows: error ? prev.rows : data,
        error: error ? toVietnameseError(error) : '',
      }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [studentId, month, reloadKey])

  const recordsLoading = recordsState.key !== recordsKey
  const records = useMemo(() => recordsState.rows, [recordsState.rows])

  const enrollments = useMemo(() => profile?.enrollments ?? [], [profile])

  // Tải lịch sử nhãn của các lớp xuất hiện trong ghi danh và điểm danh (tải lại khi có lớp mới).
  const versionKey = useMemo(() => {
    const ids = new Set(enrollments.map((row) => row.class_id))
    for (const record of records) ids.add(record.class_id)
    return [...ids].filter(Boolean).sort().join(',')
  }, [enrollments, records])
  useEffect(() => {
    if (!versionKey) return undefined
    let cancelled = false
    fetchClassVersions(versionKey.split(','))
      .then((rows) => {
        if (!cancelled) setVersions(rows)
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [versionKey])
  const activeEnrollments = useMemo(
    () =>
      enrollments
        .filter((row) => row.status === 'active')
        .sort((a, b) => String(a.classes?.name ?? '').localeCompare(String(b.classes?.name ?? ''), 'vi')),
    [enrollments],
  )
  // Lớp đã nghỉ: nhãn lớp tại ngày nghỉ.
  const droppedEnrollments = useMemo(
    () =>
      enrollments
        .filter((row) => row.status === 'dropped')
        .map((row) => ({ ...row, classes: labelClassOn(row.classes, row.class_id, versions, row.left_at) }))
        .sort((a, b) => String(b.left_at ?? '').localeCompare(String(a.left_at ?? ''))),
    [enrollments, versions],
  )

  // Nhãn lớp trong phần học phí tháng: theo buổi điểm danh cuối của lớp trong tháng,
  // không có buổi nào thì theo cuối tháng (tối đa là hôm nay). Chỉ đổi tên hiển thị, không đổi số tiền.
  const labelledEnrollments = useMemo(() => {
    if (versions.length === 0) return enrollments
    const monthEnd = addDaysISO(nextMonthStart(month), -1)
    const fallbackDate = monthEnd < today ? monthEnd : today
    return enrollments.map((row) => {
      const lastDate = records
        .filter((record) => record.class_id === row.class_id)
        .map((record) => record.attendance_date)
        .sort()
        .pop()
      return { ...row, classes: labelClassOn(row.classes, row.class_id, versions, lastDate ?? fallbackDate) }
    })
  }, [enrollments, records, versions, month, today])
  const labelledRecords = useMemo(() => {
    if (versions.length === 0) return records
    return records.map((record) => ({
      ...record,
      classes: labelClassOn(record.classes, record.class_id, versions, record.attendance_date),
    }))
  }, [records, versions])
  const labelledActive = useMemo(
    () => labelledEnrollments.filter((row) => row.status === 'active'),
    [labelledEnrollments],
  )

  const summary = useMemo(
    () => summarizeMonth(labelledEnrollments, labelledRecords),
    [labelledEnrollments, labelledRecords],
  )
  const remaining = useMemo(
    () => remainingSessions(activeEnrollments, records, today, month),
    [activeEnrollments, records, today, month],
  )
  const totalRemaining = useMemo(
    () => Object.values(remaining).reduce((sum, count) => sum + count, 0),
    [remaining],
  )

  // Các lớp hiển thị ở phần học phí: lớp có điểm danh trong tháng + lớp đang học (kể cả chưa có buổi nào).
  const sections = useMemo(() => {
    const list = [...summary.groups]
    for (const enrollment of labelledActive) {
      if (!list.some((group) => group.classId === enrollment.class_id)) {
        list.push({
          classId: enrollment.class_id,
          cls: enrollment.classes,
          active: true,
          rows: [],
          total: 0,
          chargedCount: 0,
          presentCount: 0,
          absentCount: 0,
          excusedCount: 0,
        })
      }
    }
    return list.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return String(a.cls?.name ?? '').localeCompare(String(b.cls?.name ?? ''), 'vi')
    })
  }, [summary, labelledActive])

  const isCurrentMonth = sameMonth(month, currentMonth)
  const isCurrentOrFuture = month.year * 12 + month.month >= currentMonth.year * 12 + currentMonth.month

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
    >
      <ArrowLeft size={18} aria-hidden="true" />
      Quay lại danh sách học sinh
    </button>
  )

  if (profileError) {
    return (
      <PageShell title="Hồ sơ học sinh">
        {back}
        <Notice type="error">{profileError}</Notice>
      </PageShell>
    )
  }
  if (!profile) {
    return (
      <PageShell title="Hồ sơ học sinh">
        {back}
        <p className="text-sm text-slate-500">Trung tâm đang tải hồ sơ học sinh...</p>
      </PageShell>
    )
  }

  const { student } = profile
  const parent = student.parents

  function finishClassChange(message) {
    setTransferring(null)
    setAddingClass(false)
    setNotice(message)
    setReloadKey((key) => key + 1)
  }

  return (
    <PageShell title={`Hồ sơ: ${student.full_name}`} description="Thông tin, lớp đang học và học phí dự kiến.">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        {!isTeacher && (
          <button
            type="button"
            onClick={() => setStudentAuditOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History size={16} className="text-sky-600" aria-hidden="true" />
            Lịch sử thay đổi
          </button>
        )}
      </div>

      {notice && (
        <Notice type="success" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      )}

      <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Mã học sinh</dt>
          <dd className="font-medium text-slate-800">
            {student.student_code}
            {student.deleted_at && (
              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                Đã ẩn
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Khối</dt>
          <dd className="font-medium text-slate-800">{student.grade ? `Khối ${student.grade}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Số điện thoại học sinh</dt>
          <dd className="font-medium text-slate-800">{student.phone || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Phụ huynh</dt>
          <dd className="font-medium text-slate-800">
            {parent ? (
              <>
                {parent.full_name}
                <span className="block text-xs font-normal text-slate-500">
                  {parent.phone} · {parent.parent_code}
                </span>
              </>
            ) : (
              'Chưa có'
            )}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="active-classes-title" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="active-classes-title" className="text-lg font-semibold text-slate-800">
            Các lớp đang học ({activeEnrollments.length})
          </h2>
          <button
            type="button"
            onClick={() => {
              setNotice('')
              setAddingClass(true)
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-300 px-4 text-sm font-medium text-sky-700 hover:bg-sky-50"
          >
            <Plus size={16} aria-hidden="true" />
            Đăng ký thêm lớp
          </button>
        </div>
        {activeEnrollments.length === 0 ? (
          <EmptyState title="Học sinh không học lớp nào" text="Học sinh sẽ hiện lại khi được thêm vào một lớp." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {activeEnrollments.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-800">{row.classes?.name}</p>
                <p className="text-sm text-slate-500">
                  {row.classes?.subject || 'Chưa có môn'} · {gradeText(row.classes)}
                </p>
                <dl className="mt-2 space-y-1 text-sm text-slate-600">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Giáo viên</dt>
                    <dd>{teacherOf(row.classes)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Lịch học</dt>
                    <dd>{formatSchedule(row.classes?.class_schedules)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Vào lớp</dt>
                    <dd>{formatDate(row.joined_at)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Đơn giá</dt>
                    <dd>{formatCurrency(row.classes?.price_per_session)}/buổi (giá hiện tại)</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    setNotice('')
                    setTransferring(row)
                  }}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowRightLeft size={16} aria-hidden="true" />
                  Đổi lớp
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {droppedEnrollments.length > 0 && (
        <section aria-labelledby="dropped-classes-title" className="space-y-3">
          <h2 id="dropped-classes-title" className="text-lg font-semibold text-slate-800">
            Lớp đã nghỉ ({droppedEnrollments.length})
          </h2>
          <ul className="space-y-2">
            {droppedEnrollments.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              >
                <span className="font-medium text-slate-700">{row.classes?.name}</span>
                {' · '}
                {teacherOf(row.classes)}
                {' · '}
                {formatDate(row.joined_at)} – {formatDate(row.left_at)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="tuition-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="tuition-title" className="text-lg font-semibold text-slate-800">
            Điểm danh và học phí dự kiến
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

        {!recordsLoading && recordsState.error && <Notice type="error">{recordsState.error}</Notice>}

        {recordsLoading && recordsState.key === '' ? (
          <p className="text-sm text-slate-500">
            Trung tâm đang tải điểm danh của {monthLabel(month).toLowerCase()}...
          </p>
        ) : (
          <div className={`space-y-4 transition-opacity ${recordsLoading ? 'opacity-60' : 'opacity-100'}`}>
            <div className="rounded-xl bg-sky-50 p-4">
              <p className="text-sm text-sky-700">Tổng học phí dự kiến {monthLabel(month).toLowerCase()}</p>
              <p className="text-2xl font-bold text-sky-900">{formatCurrency(summary.total)}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-md bg-emerald-100/80 px-2 py-1 text-emerald-800">
                  Có mặt: {summary.presentCount} buổi
                </span>
                <span className="rounded-md bg-red-100/80 px-2 py-1 text-red-800">
                  Vắng: {summary.absentCount} buổi
                </span>
                <span className="rounded-md bg-white/80 px-2 py-1 text-slate-700">
                  Có phép: {summary.excusedCount} buổi
                </span>
                {isCurrentOrFuture && (
                  <span className="rounded-md bg-sky-100 px-2 py-1 text-sky-800">
                    Còn lại theo lịch: {totalRemaining} buổi
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-sky-700">
                Cộng giá đã lưu của các buổi Có mặt và Vắng đã điểm danh ({summary.chargedCount} buổi tính tiền),{' '}
                {isTeacher ? 'chỉ tính các lớp do bạn phụ trách' : 'từ tất cả các lớp'}. Vắng có phép không tính tiền.
                Đổi đơn giá lớp sau này không làm đổi số tiền này.
              </p>
            </div>

            {summary.groups.length === 0 && (
              <EmptyState
                icon={CalendarX}
                title="Chưa có buổi điểm danh nào trong tháng này"
                text="Khi lớp điểm danh cho học sinh, các buổi sẽ hiện ở đây."
              />
            )}

            {sections.map((group) => (
              <article key={group.classId} className="rounded-xl border border-slate-200">
                <header className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      {group.cls ? classTitle(group.cls) : 'Lớp không xác định'}
                      {!group.active && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                          Đã nghỉ
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {group.cls?.subject || 'Chưa có môn'} · {teacherOf(group.cls)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Có mặt: {group.presentCount} · Vắng: {group.absentCount} · Có phép: {group.excusedCount}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-sm text-slate-500">{group.chargedCount} buổi tính tiền</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(group.total)}</p>
                  </div>
                </header>

                {group.rows.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Chưa có buổi điểm danh nào trong tháng này.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {group.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800">{formatDate(row.date)}</span>
                          <span className="ml-2 text-slate-500">{weekdayLabel(row.date)}</span>
                          {row.makeup && (
                            <span className="mt-1 block text-xs text-sky-700">
                              Học bù tại lớp {row.makeupClassName || 'khác'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                          <span className="w-24 text-right font-medium text-slate-700">
                            {row.status === 'absent_excused' ? 'Không tính' : formatCurrency(row.amount)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {group.active && isCurrentOrFuture && (
                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                    Còn {remaining[group.classId] ?? 0} buổi theo lịch trong tháng chưa điểm danh (chưa tính vào học
                    phí).
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {transferring && (
        <TransferClassModal
          enrollment={transferring}
          activeEnrollments={activeEnrollments}
          studentName={student.full_name}
          isTeacher={isTeacher}
          onDone={finishClassChange}
          onClose={() => setTransferring(null)}
        />
      )}
      {addingClass && (
        <AddClassModal
          studentId={student.id}
          studentName={student.full_name}
          studentHidden={Boolean(student.deleted_at)}
          isTeacher={isTeacher}
          activeEnrollments={activeEnrollments}
          onDone={finishClassChange}
          onClose={() => setAddingClass(false)}
        />
      )}
      {!isTeacher && studentAuditOpen && (
        <AuditLogModal
          onClose={() => setStudentAuditOpen(false)}
          initialStudentId={student.id}
          initialStudentName={student.full_name}
        />
      )}
    </PageShell>
  )
}