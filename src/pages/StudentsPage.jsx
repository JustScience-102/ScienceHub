import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, GraduationCap } from 'lucide-react'
import PageShell from '../components/PageShell'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import FormField from '../components/FormField'
import EmptyState from '../components/EmptyState'
import Notice from '../components/Notice'
import RowActions from '../components/RowActions'
import RegisterStudentFlow from '../components/classes/RegisterStudentFlow'
import StudentProfile from '../components/students/StudentProfile'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { toVietnameseError } from '../lib/errors'
import { normalizeText, compareVietnameseNames } from '../lib/text'
import { NONE, buildOptions } from '../lib/grade'
import SelectField from '../components/SelectField'
import {
  normalizePhone,
  isValidPhone,
  validatePhone,
  validateRequired,
} from '../lib/validators'

// Form Đăng ký / Sửa học sinh kèm thông tin phụ huynh (bắt buộc).
// Giáo viên (isTeacher): KHÔNG được đổi tên phụ huynh. Nhập SĐT trùng phụ huynh có sẵn thì tên bị khóa theo
// hồ sơ đó; SĐT chưa có thì ô tên mở để nhập (chỉ dùng khi phải tạo phụ huynh mới).
function StudentForm({ student, parents, isTeacher = false, onSave, onClose }) {
  const [fullName, setFullName] = useState(student?.full_name ?? '')
  const [phone, setPhone] = useState(student?.phone ?? '')
  const [parentPhone, setParentPhone] = useState(student?.parents?.phone ?? '')
  const [parentName, setParentName] = useState(student?.parents?.full_name ?? '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [lookup, setLookup] = useState({ phone: '', parent: null })

  const normalizedPhone = normalizePhone(parentPhone)
  const phoneValid = isValidPhone(normalizedPhone)
  const sameAsCurrentPhone = phoneValid && normalizedPhone === student?.parents?.phone

  // Giáo viên không đọc được phụ huynh của lớp khác qua RLS nên tra cứu qua RPC (chỉ khớp chính xác 10 số).
  useEffect(() => {
    if (!isTeacher || !phoneValid || sameAsCurrentPhone) return undefined
    let cancelled = false
    supabase.rpc('lookup_parent_by_phone', { p_phone: normalizedPhone }).then(({ data }) => {
      if (cancelled) return
      setLookup({ phone: normalizedPhone, parent: data ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [isTeacher, phoneValid, sameAsCurrentPhone, normalizedPhone])

  const teacherLookupPending = isTeacher && phoneValid && !sameAsCurrentPhone && lookup.phone !== normalizedPhone

  // Phụ huynh đã có trong Trung tâm (khớp theo SĐT, kể cả phụ huynh đã ẩn)
  const matchedParent = useMemo(() => {
    if (!phoneValid) return null
    if (isTeacher) {
      if (sameAsCurrentPhone) return student?.parents ?? null
      return lookup.phone === normalizedPhone ? lookup.parent : null
    }
    return parents.find((parent) => parent.phone === normalizedPhone) ?? null
  }, [isTeacher, phoneValid, sameAsCurrentPhone, student, lookup, normalizedPhone, parents])

  const isOwnParent = Boolean(matchedParent && matchedParent.id === student?.parent_id)
  // Quản lý: gắn vào phụ huynh KHÁC đã có thì tên lấy theo hồ sơ đó. Giáo viên: mọi phụ huynh có sẵn đều khóa tên.
  const lockParentName = Boolean(matchedParent) && (isTeacher || !isOwnParent)
  const shownParentName = lockParentName ? matchedParent.full_name : parentName

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {
      fullName: validateRequired(fullName, 'Vui lòng nhập họ tên học sinh.'),
      phone: validatePhone(phone),
      parentPhone: validatePhone(parentPhone, { required: true }),
      parentName: lockParentName
        ? ''
        : validateRequired(parentName, 'Vui lòng nhập họ tên phụ huynh.'),
    }
    setErrors(nextErrors)
    setFormError('')
    if (Object.values(nextErrors).some(Boolean)) return
    if (teacherLookupPending) {
      setFormError('Trung tâm đang đối chiếu số điện thoại phụ huynh, vui lòng thử lại sau giây lát.')
      return
    }

    setSaving(true)
    const message = await onSave({
      p_full_name: fullName.trim(),
      p_phone: normalizePhone(phone) || null,
      p_parent_name: shownParentName.trim(),
      p_parent_phone: normalizePhone(parentPhone),
    })
    setSaving(false)
    if (message) setFormError(message)
  }

  return (
    <Modal title={student ? 'Sửa học sinh' : 'Đăng ký học sinh'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Notice type="error">{formError}</Notice>}

        {student && (
          <p className="text-sm text-slate-500">
            Mã học sinh: <span className="font-semibold text-slate-700">{student.student_code}</span>
          </p>
        )}

        <FormField
          id="student-full-name"
          label="Họ tên học sinh"
          required
          autoFocus
          value={fullName}
          onChange={setFullName}
          error={errors.fullName}
          placeholder="Ví dụ: Nguyễn Minh Anh"
        />
        <FormField
          id="student-phone"
          label="Số điện thoại học sinh"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={setPhone}
          error={errors.phone}
          hint="Không bắt buộc. 10 chữ số, không trùng với học sinh khác."
          placeholder="0987654321"
        />

        <fieldset className="space-y-4 rounded-xl bg-slate-50 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Phụ huynh (bắt buộc)</legend>
          <FormField
            id="parent-phone"
            label="Số điện thoại phụ huynh"
            required
            type="tel"
            inputMode="numeric"
            value={parentPhone}
            onChange={setParentPhone}
            error={errors.parentPhone}
            hint="Nhập số của phụ huynh đã có để gắn thêm con vào cùng một phụ huynh."
            placeholder="0901234567"
          />
          {lockParentName && !isOwnParent && (
            <Notice type="info">
              Phụ huynh này đã có trong Trung tâm (mã {matchedParent.parent_code}
              {matchedParent.deleted_at ? ', đang ẩn và sẽ tự hiện lại' : ''}). Học sinh sẽ được gắn
              vào đúng phụ huynh này.
            </Notice>
          )}
          {isTeacher && lockParentName && isOwnParent && (
            <Notice type="info">Giáo viên không được đổi họ tên phụ huynh. Hãy liên hệ Quản lý nếu cần sửa tên.</Notice>
          )}
          {isTeacher && phoneValid && !teacherLookupPending && !matchedParent && (
            <Notice type="info">
              Số điện thoại này chưa có trong Trung tâm. Nếu phụ huynh hiện tại chỉ có một con là em này, Trung tâm
              giữ nguyên họ tên phụ huynh và chỉ đổi số điện thoại. Nếu không, Trung tâm tạo phụ huynh mới với họ
              tên bạn nhập.
            </Notice>
          )}
          <FormField
            id="parent-name"
            label="Họ tên phụ huynh"
            required
            value={shownParentName}
            onChange={setParentName}
            error={errors.parentName}
            disabled={lockParentName}
            placeholder="Ví dụ: Nguyễn Văn Minh"
          />
        </fieldset>

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
            disabled={saving}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// isTeacher: Giáo viên chỉ thấy học sinh thuộc lớp mình (RLS); không được ẩn học sinh trực tiếp.
export default function StudentsPage({ isTeacher = false } = {}) {
  const [students, setStudents] = useState([])
  const [parents, setParents] = useState([])
  const [activeCounts, setActiveCounts] = useState({})
  const [subjectsByStudent, setSubjectsByStudent] = useState({})
  const [gradeFilter, setGradeFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null: đóng, {}: đăng ký mới, object: sửa
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openedId, setOpenedId] = useState(null) // học sinh đang mở hồ sơ

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false

    async function load() {
      const [studentResult, parentResult, enrollmentResult] = await Promise.all([
        supabase
          .from('students')
          .select('*, parents(id, parent_code, full_name, phone, deleted_at)'),
        supabase.from('parents').select('id, parent_code, full_name, phone, deleted_at'),
        supabase
          .from('class_enrollments')
          .select('student_id, classes(subject)')
          .eq('status', 'active'),
      ])
      if (cancelled) return

      const error = studentResult.error || parentResult.error || enrollmentResult.error
      if (error) {
        setLoadError(toVietnameseError(error))
      } else {
        const counts = {}
        const subjects = {}
        for (const row of enrollmentResult.data) {
          counts[row.student_id] = (counts[row.student_id] ?? 0) + 1
          if (!subjects[row.student_id]) subjects[row.student_id] = new Set()
          subjects[row.student_id].add(row.classes?.subject || NONE)
        }
        setStudents(studentResult.data)
        setParents(parentResult.data)
        setActiveCounts(counts)
        setSubjectsByStudent(subjects)
        setLoadError('')
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => setReloadKey((key) => key + 1)

  // Danh sách lựa chọn của hai ô lọc, lấy từ chính dữ liệu đang hiển thị.
  const gradeOptions = useMemo(
    () => buildOptions(students.filter((s) => showHidden || !s.deleted_at).map((s) => s.grade), { numeric: true }),
    [students, showHidden],
  )
  const subjectOptions = useMemo(() => {
    const values = []
    for (const student of students) {
      if (!showHidden && student.deleted_at) continue
      const set = subjectsByStudent[student.id]
      if (!set || set.size === 0) values.push(null)
      else for (const value of set) values.push(value === NONE ? null : value)
    }
    return buildOptions(values)
  }, [students, subjectsByStudent, showHidden])

  const filteredStudents = useMemo(() => {
    const keyword = normalizeText(query)
    return students
      .filter((student) => showHidden || !student.deleted_at)
      .filter((student) => {
        if (!gradeFilter) return true
        if (gradeFilter === NONE) return !student.grade
        return String(student.grade) === gradeFilter
      })
      .filter((student) => {
        if (!subjectFilter) return true
        const set = subjectsByStudent[student.id]
        if (subjectFilter === NONE) return !set || set.size === 0 || set.has(NONE)
        return Boolean(set?.has(subjectFilter))
      })
      .filter((student) => {
        if (!keyword) return true
        const haystack = normalizeText(
          [
            student.full_name,
            student.student_code,
            student.phone,
            student.parents?.full_name,
            student.parents?.phone,
            student.parents?.parent_code,
          ].join(' '),
        )
        return haystack.includes(keyword)
      })
      .sort(
        (a, b) =>
          compareVietnameseNames(a.full_name, b.full_name) || a.student_code.localeCompare(b.student_code),
      )
  }, [students, showHidden, query, gradeFilter, subjectFilter, subjectsByStudent])

  const hiddenCount = students.filter((student) => student.deleted_at).length

  // Lưu học sinh kèm phụ huynh. Trả về câu báo lỗi (nếu có) để form hiển thị.
  // Chỉ dùng để SỬA học sinh. Đăng ký học sinh mới đi qua RegisterStudentFlow (bắt buộc chọn lớp).
  async function handleSave(values) {
    const { error } = await supabase.rpc('update_student', { p_student_id: editing.id, ...values })
    if (error) return toVietnameseError(error)

    setNotice({ type: 'success', text: `Trung tâm đã cập nhật học sinh ${values.p_full_name}.` })
    setEditing(null)
    reload()
    return ''
  }

  function requestDelete(student) {
    const count = activeCounts[student.id] ?? 0
    if (count > 0) {
      setNotice({
        type: 'error',
        text: `Không thể xóa học sinh ${student.full_name}: học sinh đang học ${count} lớp. Hãy cho học sinh nghỉ khỏi lớp trước.`,
      })
      return
    }
    setNotice(null)
    setDeleting(student)
  }

  async function confirmDelete() {
    setBusy(true)
    const { error } = await supabase
      .from('students')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleting.id)
    setBusy(false)

    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } else {
      setNotice({
        type: 'success',
        text: `Trung tâm đã xóa học sinh ${deleting.full_name} khỏi danh sách. Lịch sử vẫn được giữ, học sinh sẽ tự hiện lại khi được thêm vào một lớp.`,
      })
      reload()
    }
    setDeleting(null)
  }

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên, mã học sinh, số điện thoại hoặc phụ huynh"
            aria-label="Tìm kiếm học sinh"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing({})}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600"
        >
          <Plus size={18} aria-hidden="true" />
          Đăng ký học sinh
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="student-grade-filter"
          label="Lọc theo khối"
          value={gradeFilter}
          onChange={setGradeFilter}
          placeholder="Tất cả khối"
        >
          {gradeOptions.list.map((grade) => (
            <option key={grade} value={String(grade)}>
              Khối {grade}
            </option>
          ))}
          {gradeOptions.hasNone && <option value={NONE}>Chưa phân loại</option>}
        </SelectField>
        <SelectField
          id="student-subject-filter"
          label="Lọc theo môn đang học"
          value={subjectFilter}
          onChange={setSubjectFilter}
          placeholder="Tất cả môn"
        >
          {subjectOptions.list.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
          {subjectOptions.hasNone && <option value={NONE}>Chưa phân loại</option>}
        </SelectField>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Hiện cả học sinh đã ẩn{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
      </label>
    </div>
  )

  // Tên học sinh là nút bấm mở hồ sơ chi tiết.
  function nameButton(student) {
    return (
      <button
        type="button"
        onClick={() => setOpenedId(student.id)}
        aria-label={`Xem hồ sơ ${student.full_name}`}
        className="min-h-10 text-left font-semibold text-sky-700 underline-offset-2 hover:underline"
      >
        {student.full_name}
      </button>
    )
  }

  function parentCell(student) {
    if (!student.parents) return <span className="text-slate-400">Chưa có</span>
    return (
      <>
        <span className="font-medium">{student.parents.full_name}</span>
        <span className="block text-xs text-slate-500">
          {student.parents.phone} · {student.parents.parent_code}
        </span>
      </>
    )
  }

  let body
  if (!isSupabaseConfigured) {
    body = (
      <Notice type="error">
        Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
      </Notice>
    )
  } else if (loading && students.length === 0) {
    body = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách học sinh...</p>
  } else if (loadError) {
    body = <Notice type="error">{loadError}</Notice>
  } else if (filteredStudents.length === 0) {
    body = query || gradeFilter || subjectFilter ? (
      <EmptyState
        icon={Search}
        title="Không tìm thấy học sinh phù hợp"
        text="Hãy thử gõ tên khác, mã học sinh, số điện thoại hoặc đổi bộ lọc khối và môn."
      />
    ) : (
      <EmptyState
        icon={GraduationCap}
        title="Trung tâm chưa có học sinh nào"
        text='Bấm "Đăng ký học sinh" để bắt đầu.'
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
                <th className="px-3 py-3 font-semibold">Khối</th>
                <th className="px-3 py-3 font-semibold">Số điện thoại</th>
                <th className="px-3 py-3 font-semibold">Phụ huynh</th>
                <th className="px-3 py-3 font-semibold">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className={student.deleted_at ? 'bg-slate-50 text-slate-400' : ''}>
                  <td className="px-3 py-3 font-mono text-xs">{student.student_code}</td>
                  <td className="px-3 py-3 font-medium">
                    {nameButton(student)}
                    {student.deleted_at && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                        Đã ẩn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{student.grade ? `Khối ${student.grade}` : '—'}</td>
                  <td className="px-3 py-3">{student.phone || '—'}</td>
                  <td className="px-3 py-3">{parentCell(student)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end">
                      <RowActions
                        name={student.full_name}
                        hidden={Boolean(student.deleted_at)}
                        canDelete={!isTeacher}
                        onEdit={() => setEditing(student)}
                        onDelete={() => requestDelete(student)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Điện thoại: dạng thẻ */}
        <ul className="space-y-3 md:hidden">
          {filteredStudents.map((student) => (
            <li
              key={student.id}
              className={`rounded-xl border border-slate-200 p-4 ${student.deleted_at ? 'bg-slate-50 text-slate-400' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {nameButton(student)}
                  <p className="font-mono text-xs text-slate-500">{student.student_code}</p>
                </div>
                {student.deleted_at && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Đã ẩn</span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Khối</dt>
                  <dd>{student.grade ? `Khối ${student.grade}` : '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Điện thoại</dt>
                  <dd>{student.phone || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Phụ huynh</dt>
                  <dd>{parentCell(student)}</dd>
                </div>
              </dl>
              {!student.deleted_at && (
                <div className="mt-3">
                  <RowActions
                    name={student.full_name}
                    hidden={false}
                    canDelete={!isTeacher}
                    onEdit={() => setEditing(student)}
                    onDelete={() => requestDelete(student)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    )
  }

  // Đang mở hồ sơ: hiển thị hồ sơ thay cho danh sách. StudentsPage vẫn còn nguyên nên
  // ô tìm kiếm và bộ lọc được giữ lại khi quay về, đồng thời gọi reload() để cập nhật
  // trạng thái ẩn/hiện hoặc môn học nếu vừa đăng ký thêm lớp / đổi lớp trong hồ sơ.
  if (openedId) {
    return (
      <StudentProfile
        key={openedId}
        studentId={openedId}
        isTeacher={isTeacher}
        onBack={() => {
          setOpenedId(null)
          reload()
        }}
      />
    )
  }

  return (
    <PageShell title="Quản lý Học sinh" description="Danh sách học sinh của Trung tâm.">
      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {isSupabaseConfigured && toolbar}
      {body}

      {editing?.id && (
        <StudentForm
          student={editing}
          parents={parents}
          isTeacher={isTeacher}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && !editing.id && (
        <RegisterStudentFlow
          isTeacher={isTeacher}
          onDone={(message) => {
            setNotice({ type: 'success', text: message })
            setEditing(null)
            reload()
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa học sinh"
          message={`Trung tâm sẽ xóa học sinh ${deleting.full_name} khỏi danh sách. Lịch sử học và điểm danh vẫn được giữ, học sinh sẽ tự hiện lại khi được thêm vào một lớp (bật "Hiện cả học sinh đã ẩn" để xem lại). Nếu đây là con cuối cùng của phụ huynh, phụ huynh cũng sẽ được ẩn theo.`}
          confirmLabel="Xóa học sinh"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageShell>
  )
}