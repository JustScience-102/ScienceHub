import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import AppLayout from './components/layout/AppLayout'
import ChangePasswordModal from './components/auth/ChangePasswordModal'
import Notice from './components/Notice'
import ClassesPage from './pages/ClassesPage'
import StudentsPage from './pages/StudentsPage'
import LoginPage from './pages/LoginPage'
import { supabase } from './lib/supabaseClient'
import { toVietnameseError } from './lib/errors'

// Hai trang chỉ Quản lý dùng: tải riêng khi mở (Giáo viên không phải tải).
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeachersPage = lazy(() => import('./pages/TeachersPage'))

const PAGES = {
  dashboard: DashboardPage,
  teachers: TeachersPage,
  classes: ClassesPage,
  students: StudentsPage,
}

// Thông báo tiếng Việt khi phiên bị từ chối theo trạng thái my_profile().
const REJECT_MESSAGES = {
  no_profile:
    'Tài khoản này chưa được Trung tâm cấp quyền sử dụng. Hãy liên hệ Quản lý để được liên kết tài khoản.',
  inactive: 'Tài khoản này đã bị khóa. Hãy liên hệ Quản lý của Trung tâm.',
  teacher_hidden: 'Hồ sơ giáo viên của tài khoản này đã bị ẩn nên không thể đăng nhập.',
  expired:
    'Phiên đăng nhập của giáo viên đã quá 48 giờ. Vui lòng đăng nhập lại để tiếp tục.',
}

const MAX_TIMEOUT_MS = 2 ** 31 - 1

// Phần giao diện sau khi đã đăng nhập. Được gắn key = id người dùng ở App, nên khi đổi tài khoản
// trên cùng trình duyệt thì mọi state (trang đang mở, lối tắt...) bị xóa sạch.
function Shell({ userProfile, onOpenChangePassword, onSignOut }) {
  const isManager = userProfile.role === 'manager'
  const isTeacher = userProfile.role === 'teacher'
  const teacherId = userProfile.teacher_id ?? null

  // Giáo viên không có Tổng quan và Quản lý Giáo viên: trang mặc định là Lớp học.
  const [currentPage, setCurrentPage] = useState(isTeacher ? 'classes' : 'dashboard')
  // Lối tắt từ Dashboard: { classId, date, nonce }. nonce đổi mỗi lần bấm để ClassesPage mở lại từ đầu.
  const [shortcut, setShortcut] = useState(null)

  // Bấm menu thủ công thì bỏ lối tắt, để vào trang Lớp không tự mở lớp cũ.
  const navigate = (target) => {
    setShortcut(null)
    setCurrentPage(target)
  }

  const openAttendance = (classId, date) => {
    setShortcut({ classId, date, nonce: Date.now() })
    setCurrentPage('classes')
  }

  // Phòng hờ: Giáo viên không bao giờ vào được 2 trang chỉ dành cho Quản lý.
  const page = isTeacher && (currentPage === 'dashboard' || currentPage === 'teachers') ? 'classes' : currentPage
  const roleProps = { isManager, isTeacher, teacherId }

  let content
  if (!isManager && !isTeacher) {
    content = (
      <Notice type="error">Tài khoản này chưa được Trung tâm cấp vai trò sử dụng.</Notice>
    )
  } else if (page === 'dashboard') {
    content = <DashboardPage onOpenAttendance={openAttendance} />
  } else if (page === 'classes' && shortcut) {
    content = (
      <ClassesPage
        key={shortcut.nonce}
        initialClassId={shortcut.classId}
        initialDate={shortcut.date}
        {...roleProps}
      />
    )
  } else {
    const Page = PAGES[page]
    content = <Page {...roleProps} />
  }

  return (
    <AppLayout
      currentPage={page}
      onNavigate={navigate}
      userProfile={userProfile}
      onOpenChangePassword={onOpenChangePassword}
      onSignOut={onSignOut}
    >
      <Suspense
        fallback={
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            Trung tâm đang mở trang...
          </p>
        }
      >
        {content}
      </Suspense>
    </AppLayout>
  )
}

// Cổng đăng nhập + chuyển màn hình bằng trạng thái React (không dùng thư viện định tuyến).
export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  // Hồ sơ vai trò của phiên hiện tại (kết quả my_profile, đã được xác nhận status = 'ok').
  const [profile, setProfile] = useState(null)
  const [authNotice, setAuthNotice] = useState(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const userId = session?.user?.id ?? null

  // Theo dõi phiên đăng nhập. Không gọi Supabase bên trong callback (tránh bế tắc khóa phiên).
  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        setSession(data?.session ?? null)
        setAuthLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSession(null)
        setAuthLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') {
        setRecoveryMode(false)
        setShowChangePassword(false)
      }
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const forceSignOut = useCallback(async (text) => {
    setAuthNotice({ type: 'error', text })
    setProfile(null)
    if (supabase) await supabase.auth.signOut()
  }, [])

  // Khi có phiên mới: hỏi Database xem tài khoản có được phép dùng không.
  useEffect(() => {
    if (!supabase || !userId) return undefined
    let cancelled = false

    supabase.rpc('my_profile').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        const missing = error.code === 'PGRST202' || error.code === '42883'
        forceSignOut(
          missing
            ? 'Database chưa cài đủ bộ SQL V3. Hãy chạy lần lượt các file trong thư mục supabase/v3 (00 đến 09) trong Supabase SQL Editor.'
            : toVietnameseError(error),
        )
        return
      }
      if (!data || data.status !== 'ok') {
        forceSignOut(REJECT_MESSAGES[data?.status] ?? REJECT_MESSAGES.no_profile)
        return
      }
      setAuthNotice(null)
      setProfile(data)
    })

    return () => {
      cancelled = true
    }
  }, [userId, forceSignOut])

  // Giáo viên: tự đăng xuất đúng lúc hết hạn 48 giờ (Database cũng đã từ chối từ lúc đó).
  const expiresAt = profile?.role === 'teacher' ? profile.expires_at : null
  useEffect(() => {
    if (!expiresAt) return undefined
    const wait = new Date(expiresAt).getTime() - Date.now()
    const timer = setTimeout(
      () => forceSignOut(REJECT_MESSAGES.expired),
      Math.min(Math.max(wait, 0), MAX_TIMEOUT_MS),
    )
    return () => clearTimeout(timer)
  }, [expiresAt, forceSignOut])

  const handleSignOut = async () => {
    setAuthNotice(null)
    setProfile(null)
    if (supabase) await supabase.auth.signOut()
  }

  const closePasswordModal = () => {
    setShowChangePassword(false)
    setRecoveryMode(false)
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Trung tâm đang kiểm tra phiên đăng nhập...
        </p>
      </div>
    )
  }

  if (!session) {
    return <LoginPage notice={authNotice} />
  }

  // Có phiên nhưng chưa xác nhận xong vai trò (hoặc hồ sơ cũ của tài khoản trước đó).
  if (!profile || profile.user_id !== userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Trung tâm đang kiểm tra quyền truy cập...
        </p>
      </div>
    )
  }

  return (
    <>
      <Shell
        key={userId}
        userProfile={profile}
        onOpenChangePassword={() => setShowChangePassword(true)}
        onSignOut={handleSignOut}
      />
      {(showChangePassword || recoveryMode) && (
        <ChangePasswordModal recovery={recoveryMode} onClose={closePasswordModal} />
      )}
    </>
  )
}