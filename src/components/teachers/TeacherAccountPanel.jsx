import { useState } from 'react'
import { KeyRound, Link2, Lock, Unlock } from 'lucide-react'
import Modal from '../Modal'
import FormField from '../FormField'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { validateEmail, validateRequired } from '../../lib/validators'
import { accountStatus } from '../../lib/teacherAccount'
import AccountBadge from './AccountBadge'

// Hộp thoại liên kết tài khoản: email phải là user đã tạo sẵn trong Supabase Authentication.
function LinkAccountDialog({ teacher, onDone, onClose }) {
  const [email, setEmail] = useState(teacher.email ?? '')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const message = validateRequired(email, 'Vui lòng nhập email tài khoản giáo viên.') || validateEmail(email)
    setError(message)
    setFormError('')
    if (message) return

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('link_teacher_account', {
      p_email: email.trim(),
      p_teacher_id: teacher.id,
    })
    setSaving(false)
    if (rpcError) {
      setFormError(toVietnameseError(rpcError))
      return
    }
    onDone(`Trung tâm đã liên kết tài khoản ${email.trim().toLowerCase()} với giáo viên ${teacher.full_name}.`)
  }

  return (
    <Modal title="Liên kết tài khoản đăng nhập" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Tạo người dùng cho giáo viên <strong>{teacher.full_name}</strong> trong Supabase Authentication trước, rồi
          nhập đúng email đó vào đây. Giáo viên đăng nhập bằng email và mật khẩu đã tạo.
        </p>
        {formError && <Notice type="error">{formError}</Notice>}
        <FormField
          id="link-account-email"
          label="Email tài khoản đăng nhập"
          type="email"
          required
          autoFocus
          value={email}
          onChange={setEmail}
          error={error}
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
            {saving ? 'Đang liên kết...' : 'Liên kết tài khoản'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Khu vực tài khoản trong Hồ sơ giáo viên (chỉ Quản lý thấy trang này).
//   profile: dòng profiles của giáo viên hoặc null; onChanged(message): gọi sau khi liên kết/khóa thành công.
export default function TeacherAccountPanel({ teacher, profile, onChanged }) {
  const [linking, setLinking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const status = accountStatus(profile)

  async function toggleActive() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    const nextActive = !profile.active
    const { error } = await supabase.rpc('set_teacher_account_active', {
      p_teacher_id: teacher.id,
      p_active: nextActive,
    })
    setBusy(false)
    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
      return
    }
    onChanged(
      nextActive
        ? `Trung tâm đã mở khóa tài khoản của giáo viên ${teacher.full_name}.`
        : `Trung tâm đã khóa tài khoản của giáo viên ${teacher.full_name}.`,
    )
  }

  return (
    <section aria-labelledby="teacher-account-title" className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="teacher-account-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <KeyRound size={20} className="text-sky-600" aria-hidden="true" />
            Tài khoản đăng nhập
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Trạng thái: <AccountBadge profile={profile} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setLinking(true)
            }}
            disabled={Boolean(teacher.deleted_at)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-300 px-4 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 size={16} aria-hidden="true" />
            Liên kết tài khoản đăng nhập
          </button>
          {profile && (
            <button
              type="button"
              onClick={toggleActive}
              disabled={busy || (!profile.active && Boolean(teacher.deleted_at))}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                profile.active
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {profile.active ? <Lock size={16} aria-hidden="true" /> : <Unlock size={16} aria-hidden="true" />}
              {profile.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
            </button>
          )}
        </div>
      </div>

      {teacher.deleted_at && (
        <p className="text-xs text-amber-700">
          Giáo viên đang bị ẩn nên không thể liên kết hoặc mở khóa tài khoản. Hãy khôi phục giáo viên trước.
        </p>
      )}
      {status.key === 'none' && !teacher.deleted_at && (
        <p className="text-xs text-slate-500">Giáo viên này chưa có tài khoản để đăng nhập vào hệ thống.</p>
      )}

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {linking && (
        <LinkAccountDialog
          teacher={teacher}
          onDone={(message) => {
            setLinking(false)
            onChanged(message)
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </section>
  )
}
