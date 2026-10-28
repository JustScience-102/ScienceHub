import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardCheck, History, UserPlus, UserMinus, Users } from 'lucide-react'
import PageShell from '../PageShell'
import AuditLogModal from '../audit/AuditLogModal'
import EmptyState from '../EmptyState'
import Notice from '../Notice'
import EnrollStudentModal from './EnrollStudentModal'
import DropEnrollmentDialog from './DropEnrollmentDialog'
import ClassAttendance from './ClassAttendance'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { compareVietnameseNames } from '../../lib/text'

// Màn hình chi tiết lớp: danh sách học sinh, thêm học sinh, cho nghỉ.
// Có tab "Điểm danh". initialTab / initialDate cho phép mở thẳng tab điểm danh
// (dùng cho lối tắt từ Dashboard).
export default function ClassRoster({
  cls,
  schedule,
  teacherName,
  onBack,
  initialTab = 'students',
  initialDate,
  isTeacher = false,
}) {
  const [tab, setTab] = useState(initialTab)
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [showDropped, setShowDropped] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [dropping, setDropping] = useState(null)
  const [checkingId, setCheckingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [classAuditOpen, setClassAuditOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('id, student_id, status, joined_at, left_at, students(id, student_code, full_name)')
        .eq('class_id', cls.id)
      if (cancelled) return
      if (error) {
        setLoadError(toVietnameseError(error))
      } else {
        setEnrollments(data)
        setLoadError('')
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [cls.id, reloadKey])

  const reload = () => setReloadKey((key) => key + 1)

  const activeRows = useMemo(
    () =>
      enrollments
        .filter((row) => row.status === 'active')
        .sort((a, b) => compareVietnameseNames(a.students?.full_name, b.students?.full_name)),
    [enrollments],
  )
  const droppedRows = useMemo(
    () =>
      enrollments
        .filter((row) => row.status === 'dropped')
        .sort((a, b) => compareVietnameseNames(a.students?.full_name, b.students?.full_name)),
    [enrollments],
  )
  const visibleRows = showDropped ? [...activeRows, ...droppedRows] : activeRows

  // Hộp thoại thêm học sinh tự tải danh sách và tự lưu; xong thì báo lại để làm mới danh sách lớp.
  function handleEnrolled(message) {
    setNotice({ type: 'success', text: message })
    setEnrolling(false)
    reload()
  }

  // Bấm "Cho nghỉ": kiểm tra trước xem đây có phải lớp cuối cùng của học sinh không
  // (nghỉ lớp cuối thì học sinh tự ẩn khỏi danh sách học sinh).
  async function requestDrop(row) {
    if (checkingId) return
    setNotice(null)
    // Giáo viên không thấy lớp của giáo viên khác (RLS) nên không đếm được số lớp còn lại của học sinh;
    // hộp thoại sẽ hiện ghi chú chung thay vì khẳng định "lớp cuối cùng".
    if (isTeacher) {
      setDropping({ row, isLastClass: false })
      return
    }
    setCheckingId(row.id)
    const { count, error } = await supabase
      .from('class_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', row.student_id)
      .eq('status', 'active')
      .neq('id', row.id)
    setCheckingId(null)
    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
      return
    }
    setDropping({ row, isLastClass: (count ?? 0) === 0 })
  }

  async function handleDrop(leftAt, deleteAttendance) {
    const { data, error } = await supabase.rpc('drop_enrollment', {
      p_enrollment_id: dropping.row.id,
      p_left_at: leftAt,
      p_delete_attendance: deleteAttendance,
    })
    if (error) return toVietnameseError(error)

    const name = dropping.row.students?.full_name ?? 'học sinh'
    setNotice({
      type: 'success',
      text:
        `Trung tâm đã cho ${name} nghỉ khỏi lớp ${cls.name} từ ${formatDate(leftAt)}. Lịch sử vẫn được giữ.` +
        (dropping.isLastClass
          ? ` ${name} không còn học lớp nào nên đã được ẩn khỏi danh sách học sinh, và sẽ hiện lại khi được thêm vào một lớp.`
          : '') +
        (data > 0 ? ` Đã xóa ${data} buổi điểm danh sau ngày nghỉ.` : ''),
    })
    setDropping(null)
    reload()
    return ''
  }

  let body
  if (loading && enrollments.length === 0) {
    body = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách học sinh...</p>
  } else if (loadError) {
    body = <Notice type="error">{loadError}</Notice>
  } else if (visibleRows.length === 0) {
    body = (
      <EmptyState
        icon={Users}
        title="Lớp chưa có học sinh nào đang học"
        text='Bấm "Thêm học sinh" để ghi danh học sinh vào lớp.'
      />
    )
  } else {
    body = (
      <>
        {/* Máy tính: dạng bảng */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Mã HS</th>
                <th className="px-3 py-3 font-semibold">Họ tên</th>
                <th className="px-3 py-3 font-semibold">Ngày vào lớp</th>
                <th className="px-3 py-3 font-semibold">Trạng thái</th>
                <th className="px-3 py-3 font-semibold">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row) => {
                const dropped = row.status === 'dropped'
                return (
                  <tr key={row.id} className={dropped ? 'bg-slate-50 text-slate-400' : ''}>
                    <td className="px-3 py-3 font-mono text-xs">{row.students?.student_code}</td>
                    <td className="px-3 py-3 font-medium">{row.students?.full_name}</td>
                    <td className="px-3 py-3">{formatDate(row.joined_at)}</td>
                    <td className="px-3 py-3">
                      {dropped ? (
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Đã nghỉ {formatDate(row.left_at)}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Đang học
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {!dropped && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => requestDrop(row)}
                            disabled={checkingId === row.id}
                            aria-label={`Cho ${row.students?.full_name} nghỉ khỏi lớp`}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            <UserMinus size={16} aria-hidden="true" />
                            {checkingId === row.id ? 'Đang kiểm tra...' : 'Cho nghỉ'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Điện thoại: dạng thẻ */}
        <ul className="space-y-3 md:hidden">
          {visibleRows.map((row) => {
            const dropped = row.status === 'dropped'
            return (
              <li
                key={row.id}
                className={`rounded-xl border border-slate-200 p-4 ${dropped ? 'bg-slate-50 text-slate-400' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{row.students?.full_name}</p>
                    <p className="font-mono text-xs text-slate-500">{row.students?.student_code}</p>
                  </div>
                  {dropped ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Đã nghỉ {formatDate(row.left_at)}
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Đang học
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-600">Vào lớp {formatDate(row.joined_at)}</p>
                {!dropped && (
                  <button
                    type="button"
                    onClick={() => requestDrop(row)}
                    disabled={checkingId === row.id}
                    aria-label={`Cho ${row.students?.full_name} nghỉ khỏi lớp`}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    <UserMinus size={16} aria-hidden="true" />
                    {checkingId === row.id ? 'Đang kiểm tra...' : 'Cho nghỉ'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  return (
    <PageShell title={`Lớp ${cls.name}`} description="Danh sách học sinh và điểm danh của lớp.">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Quay lại danh sách lớp
        </button>
        {!isTeacher && (
          <button
            type="button"
            onClick={() => setClassAuditOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History size={16} className="text-sky-600" aria-hidden="true" />
            Lịch sử lớp
          </button>
        )}
      </div>

      <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Giáo viên</dt>
          <dd className="font-medium text-slate-800">{teacherName || 'Chưa gắn giáo viên'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Lịch học</dt>
          <dd className="font-medium text-slate-800">{schedule}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Đơn giá hiện tại</dt>
          <dd className="font-medium text-slate-800">{formatCurrency(cls.price_per_session)}/buổi</dd>
        </div>
      </dl>

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div role="tablist" aria-label="Chức năng của lớp" className="flex gap-2 border-b border-slate-200">
        {[
          { value: 'students', label: `Học sinh (${activeRows.length})`, icon: Users },
          { value: 'attendance', label: 'Điểm danh', icon: ClipboardCheck },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium ${
              tab === item.value
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <item.icon size={16} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <ClassAttendance cls={cls} initialDate={initialDate} isTeacher={isTeacher} />}

      {tab === 'students' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showDropped}
                onChange={(event) => setShowDropped(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Hiện cả học sinh đã nghỉ{droppedRows.length > 0 ? ` (${droppedRows.length})` : ''}
            </label>
            {!cls.deleted_at && (
              <button
                type="button"
                onClick={() => {
                  setNotice(null)
                  setEnrolling(true)
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600"
              >
                <UserPlus size={18} aria-hidden="true" />
                Thêm học sinh
              </button>
            )}
          </div>

          {body}
        </>
      )}

      {enrolling && (
        <EnrollStudentModal
          cls={cls}
          isTeacher={isTeacher}
          onDone={handleEnrolled}
          onClose={() => setEnrolling(false)}
        />
      )}
      {dropping && (
        <DropEnrollmentDialog
          enrollment={dropping.row}
          isLastClass={dropping.isLastClass}
          isTeacher={isTeacher}
          studentName={dropping.row.students?.full_name ?? 'học sinh'}
          className={cls.name}
          onConfirm={handleDrop}
          onClose={() => setDropping(null)}
        />
      )}
      {!isTeacher && classAuditOpen && (
        <AuditLogModal
          onClose={() => setClassAuditOpen(false)}
          initialClassId={cls.id}
          initialClassName={cls.name}
        />
      )}
    </PageShell>
  )
}