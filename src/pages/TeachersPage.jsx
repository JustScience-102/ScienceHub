import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, UserSquare } from 'lucide-react'
import PageShell from '../components/PageShell'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import FormField from '../components/FormField'
import EmptyState from '../components/EmptyState'
import Notice from '../components/Notice'
import RowActions from '../components/RowActions'
import TeacherProfile from '../components/teachers/TeacherProfile'
import AccountBadge from '../components/teachers/AccountBadge'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { toVietnameseError } from '../lib/errors'
import { compareVietnameseNames, normalizeText } from '../lib/text'
import {
  normalizePhone,
  validatePhone,
  validateEmail,
  validateRequired,
} from '../lib/validators'

// Form Thêm / Sửa giáo viên (hộp thoại).
function TeacherForm({ teacher, onSave, onClose }) {
  const [fullName, setFullName] = useState(teacher?.full_name ?? '')
  const [phone, setPhone] = useState(teacher?.phone ?? '')
  const [email, setEmail] = useState(teacher?.email ?? '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {
      fullName: validateRequired(fullName, 'Vui lòng nhập họ tên giáo viên.'),
      phone: validatePhone(phone),
      email: validateEmail(email),
    }
    setErrors(nextErrors)
    setFormError('')
    if (Object.values(nextErrors).some(Boolean)) return

    setSaving(true)
    const message = await onSave({
      full_name: fullName.trim(),
      phone: normalizePhone(phone) || null,
      email: email.trim() || null,
    })
    setSaving(false)
    if (message) setFormError(message)
  }

  return (
    <Modal title={teacher ? 'Sửa giáo viên' : 'Thêm giáo viên'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Notice type="error">{formError}</Notice>}
        <FormField
          id="teacher-full-name"
          label="Họ tên"
          required
          autoFocus
          value={fullName}
          onChange={setFullName}
          error={errors.fullName}
          placeholder="Ví dụ: Nguyễn Thị Lan"
        />
        <FormField
          id="teacher-phone"
          label="Số điện thoại"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={setPhone}
          error={errors.phone}
          hint="10 chữ số, bắt đầu bằng 0. Không trùng với giáo viên khác."
          placeholder="0912345678"
        />
        <FormField
          id="teacher-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          placeholder="giaovien@example.com"
        />
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

export default function TeachersPage() {
  const [teachers, setTeachers] = useState([])
  const [classCounts, setClassCounts] = useState({})
  const [profilesByTeacher, setProfilesByTeacher] = useState({})
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null: đóng, {}: thêm mới, object: sửa
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openedId, setOpenedId] = useState(null) // giáo viên đang mở hồ sơ

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false

    async function load() {
      const [teacherResult, classResult, profileResult] = await Promise.all([
        supabase.from('teachers').select('*'),
        supabase.from('classes').select('teacher_id').is('deleted_at', null),
        supabase.from('profiles').select('teacher_id, active').eq('role', 'teacher'),
      ])
      if (cancelled) return

      const error = teacherResult.error || classResult.error || profileResult.error
      if (error) {
        setLoadError(toVietnameseError(error))
      } else {
        const counts = {}
        for (const row of classResult.data) {
          if (row.teacher_id) counts[row.teacher_id] = (counts[row.teacher_id] ?? 0) + 1
        }
        const profiles = {}
        for (const row of profileResult.data) profiles[row.teacher_id] = row
        setTeachers(teacherResult.data)
        setClassCounts(counts)
        setProfilesByTeacher(profiles)
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

  const visibleTeachers = useMemo(() => {
    const keyword = normalizeText(query)
    return teachers
      .filter((teacher) => showHidden || !teacher.deleted_at)
      .filter((teacher) => {
        if (!keyword) return true
        const haystack = normalizeText([teacher.full_name, teacher.phone, teacher.email].join(' '))
        return haystack.includes(keyword)
      })
      .sort((a, b) => compareVietnameseNames(a.full_name, b.full_name))
  }, [teachers, showHidden, query])

  const hiddenCount = teachers.filter((teacher) => teacher.deleted_at).length

  // Lưu giáo viên. Trả về câu báo lỗi (nếu có) để form hiển thị.
  async function handleSave(values) {
    const queryBuilder = editing?.id
      ? supabase.from('teachers').update(values).eq('id', editing.id)
      : supabase.from('teachers').insert(values)
    const { error } = await queryBuilder
    if (error) return toVietnameseError(error)

    setNotice({
      type: 'success',
      text: editing?.id
        ? `Trung tâm đã cập nhật giáo viên ${values.full_name}.`
        : `Trung tâm đã thêm giáo viên ${values.full_name}.`,
    })
    setEditing(null)
    reload()
    return ''
  }

  function requestDelete(teacher) {
    const count = classCounts[teacher.id] ?? 0
    if (count > 0) {
      setNotice({
        type: 'error',
        text: `Không thể xóa giáo viên ${teacher.full_name}: giáo viên đang phụ trách ${count} lớp. Hãy chuyển lớp cho giáo viên khác trước.`,
      })
      return
    }
    setNotice(null)
    setDeleting(teacher)
  }

  async function confirmDelete() {
    setBusy(true)
    const { error } = await supabase
      .from('teachers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleting.id)
    setBusy(false)

    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } else {
      setNotice({
        type: 'success',
        text: `Trung tâm đã xóa giáo viên ${deleting.full_name} khỏi danh sách. Lịch sử vẫn được giữ và có thể khôi phục.`,
      })
      reload()
    }
    setDeleting(null)
  }

  async function handleRestore(teacher) {
    if (busy) return
    setBusy(true)
    const { error } = await supabase
      .from('teachers')
      .update({ deleted_at: null })
      .eq('id', teacher.id)
    setBusy(false)

    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } else {
      setNotice({ type: 'success', text: `Trung tâm đã khôi phục giáo viên ${teacher.full_name}.` })
      reload()
    }
  }

  // Tên giáo viên là nút bấm mở hồ sơ chi tiết.
  function nameButton(teacher) {
    return (
      <button
        type="button"
        onClick={() => setOpenedId(teacher.id)}
        aria-label={`Xem hồ sơ ${teacher.full_name}`}
        className="min-h-10 text-left font-semibold text-sky-700 underline-offset-2 hover:underline"
      >
        {teacher.full_name}
      </button>
    )
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
            placeholder="Tìm theo tên, số điện thoại hoặc email giáo viên"
            aria-label="Tìm kiếm giáo viên"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing({})}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600"
        >
          <Plus size={18} aria-hidden="true" />
          Thêm giáo viên
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Hiện cả giáo viên đã ẩn{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
      </label>
    </div>
  )

  let body
  if (!isSupabaseConfigured) {
    body = (
      <Notice type="error">
        Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
      </Notice>
    )
  } else if (loading && teachers.length === 0) {
    body = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách giáo viên...</p>
  } else if (loadError) {
    body = <Notice type="error">{loadError}</Notice>
  } else if (visibleTeachers.length === 0) {
    body = query ? (
      <EmptyState
        icon={Search}
        title="Không tìm thấy giáo viên phù hợp"
        text="Hãy thử gõ tên khác, số điện thoại hoặc email khác."
      />
    ) : (
      <EmptyState
        icon={UserSquare}
        title="Trung tâm chưa có giáo viên nào"
        text='Bấm "Thêm giáo viên" để bắt đầu.'
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
                <th className="px-3 py-3 font-semibold">Họ tên</th>
                <th className="px-3 py-3 font-semibold">Số điện thoại</th>
                <th className="px-3 py-3 font-semibold">Email</th>
                <th className="px-3 py-3 font-semibold">Tài khoản</th>
                <th className="px-3 py-3 text-center font-semibold">Số lớp phụ trách</th>
                <th className="px-3 py-3 font-semibold">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTeachers.map((teacher) => (
                <tr key={teacher.id} className={teacher.deleted_at ? 'bg-slate-50 text-slate-400' : ''}>
                  <td className="px-3 py-3 font-medium">
                    {nameButton(teacher)}
                    {teacher.deleted_at && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                        Đã ẩn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{teacher.phone || '—'}</td>
                  <td className="px-3 py-3">{teacher.email || '—'}</td>
                  <td className="px-3 py-3">
                    <AccountBadge profile={profilesByTeacher[teacher.id] ?? null} />
                  </td>
                  <td className="px-3 py-3 text-center">{classCounts[teacher.id] ?? 0}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end">
                      <RowActions
                        name={teacher.full_name}
                        hidden={Boolean(teacher.deleted_at)}
                        onEdit={() => setEditing(teacher)}
                        onDelete={() => requestDelete(teacher)}
                        onRestore={() => handleRestore(teacher)}
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
          {visibleTeachers.map((teacher) => (
            <li
              key={teacher.id}
              className={`rounded-xl border border-slate-200 p-4 ${teacher.deleted_at ? 'bg-slate-50 text-slate-400' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                {nameButton(teacher)}
                {teacher.deleted_at && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Đã ẩn</span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Điện thoại</dt>
                  <dd>{teacher.phone || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Email</dt>
                  <dd className="break-all">{teacher.email || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Tài khoản</dt>
                  <dd>
                    <AccountBadge profile={profilesByTeacher[teacher.id] ?? null} />
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Số lớp</dt>
                  <dd>{classCounts[teacher.id] ?? 0}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <RowActions
                  name={teacher.full_name}
                  hidden={Boolean(teacher.deleted_at)}
                  onEdit={() => setEditing(teacher)}
                  onDelete={() => requestDelete(teacher)}
                  onRestore={() => handleRestore(teacher)}
                />
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  // Đang mở hồ sơ: hiển thị hồ sơ thay cho danh sách (trạng thái trang được giữ khi quay về).
  if (openedId) {
    return <TeacherProfile key={openedId} teacherId={openedId} onBack={() => setOpenedId(null)} />
  }

  return (
    <PageShell title="Quản lý Giáo viên" description="Danh sách giáo viên của Trung tâm.">
      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {isSupabaseConfigured && toolbar}
      {body}

      {editing && (
        <TeacherForm
          teacher={editing.id ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa giáo viên"
          message={`Trung tâm sẽ xóa giáo viên ${deleting.full_name} khỏi danh sách. Dữ liệu cũ vẫn được giữ và bạn có thể khôi phục bất cứ lúc nào bằng cách bật "Hiện cả giáo viên đã ẩn".`}
          confirmLabel="Xóa giáo viên"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageShell>
  )
}