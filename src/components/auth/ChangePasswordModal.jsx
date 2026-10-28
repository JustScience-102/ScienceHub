import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../Modal'
import FormField from '../FormField'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'

const MIN_LENGTH = 6

// Hộp thoại đổi mật khẩu. Dùng ở 2 ngữ cảnh:
//   - recovery = false: người dùng bấm "Đổi mật khẩu" khi đang đăng nhập.
//   - recovery = true : người dùng vừa bấm liên kết khôi phục trong email (PASSWORD_RECOVERY).
export default function ChangePasswordModal({ recovery = false, onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [done, setDone] = useState(false)

  function validate() {
    const next = {}
    if (password.length < MIN_LENGTH) {
      next.password = `Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự.`
    }
    if (!confirm) {
      next.confirm = 'Vui lòng nhập lại mật khẩu mới.'
    } else if (confirm !== password) {
      next.confirm = 'Mật khẩu nhập lại chưa khớp.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !supabase) return
    setFailure('')
    if (!validate()) return

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setFailure(toVietnameseError(error))
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  const title = recovery ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'

  if (done) {
    return (
      <Modal title={title} onClose={onClose}>
        <div className="space-y-4">
          <Notice type="success">Trung tâm đã cập nhật mật khẩu mới của bạn.</Notice>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Đóng
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {recovery && (
          <Notice type="info">
            Bạn vừa mở liên kết khôi phục. Hãy nhập mật khẩu mới để tiếp tục sử dụng.
          </Notice>
        )}
        {failure && <Notice type="error">{failure}</Notice>}

        <FormField
          id="new-password"
          label="Mật khẩu mới"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint={`Tối thiểu ${MIN_LENGTH} ký tự.`}
          required
          autoFocus
        />
        <FormField
          id="confirm-password"
          label="Nhập lại mật khẩu mới"
          type="password"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          required
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Lưu mật khẩu mới
          </button>
        </div>
      </form>
    </Modal>
  )
}
