import { useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import FormField from '../components/FormField'
import Notice from '../components/Notice'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { toVietnameseError } from '../lib/errors'
import { validateEmail, validateRequired } from '../lib/validators'

// Màn hình đăng nhập. Chế độ 1: Email + Mật khẩu. Chế độ 2: Quên mật khẩu (gửi liên kết về email).
// `notice` = { type, text } do App truyền vào (ví dụ: phiên hết hạn nên bị đăng xuất).
export default function LoginPage({ notice }) {
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { type, text }

  function switchMode(next) {
    setMode(next)
    setErrors({})
    setMessage(null)
    setPassword('')
  }

  function validate() {
    const next = {}
    const emailError =
      validateRequired(email, 'Vui lòng nhập email.') || validateEmail(email)
    if (emailError) next.email = emailError
    if (mode === 'login') {
      const passwordError = validateRequired(password, 'Vui lòng nhập mật khẩu.')
      if (passwordError) next.password = passwordError
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !supabase) return
    setMessage(null)
    if (!validate()) return

    setBusy(true)
    const cleanEmail = email.trim().toLowerCase()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })
      if (error) setMessage({ type: 'error', text: toVietnameseError(error) })
      // Đăng nhập thành công: App tự nhận phiên mới qua onAuthStateChange.
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      })
      if (error) {
        setMessage({ type: 'error', text: toVietnameseError(error) })
      } else {
        setMessage({
          type: 'success',
          text: 'Trung tâm đã gửi hướng dẫn đặt lại mật khẩu. Hãy kiểm tra hộp thư của email này (kể cả thư mục Spam) và bấm vào liên kết trong thư.',
        })
      }
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 text-white">
            <BookOpen size={26} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Trung tâm ScienceHub</h1>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login'
                ? 'Đăng nhập để tiếp tục'
                : 'Nhập email để nhận liên kết đặt lại mật khẩu'}
            </p>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4">
            <Notice type="error">
              Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
            </Notice>
          </div>
        )}

        {notice && !message && (
          <div className="mb-4">
            <Notice type={notice.type}>{notice.text}</Notice>
          </div>
        )}
        {message && (
          <div className="mb-4">
            <Notice type={message.type}>{message.text}</Notice>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField
            id="login-email"
            label="Email"
            type="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
            placeholder="ten@example.com"
            required
            autoFocus
          />
          {mode === 'login' && (
            <FormField
              id="login-password"
              label="Mật khẩu"
              type="password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              required
            />
          )}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {mode === 'login' ? 'Đăng nhập' : 'Gửi liên kết đặt lại mật khẩu'}
          </button>
        </form>

        <div className="mt-4 text-center">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="text-sm font-medium text-sky-600 hover:underline"
            >
              Quên mật khẩu?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-sm font-medium text-sky-600 hover:underline"
            >
              Quay lại đăng nhập
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
