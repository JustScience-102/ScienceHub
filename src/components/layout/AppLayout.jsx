import { BookOpen } from 'lucide-react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

// Khung chung: thanh bên (máy tính) + thanh tiêu đề gọn và thanh tab đáy (điện thoại).
export default function AppLayout({
  currentPage,
  onNavigate,
  userProfile,
  onOpenChangePassword,
  onSignOut,
  children,
}) {
  const roleLabel = userProfile?.role === 'manager' ? 'Quản lý' : 'Giáo viên'

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        userProfile={userProfile}
        onOpenChangePassword={onOpenChangePassword}
        onSignOut={onSignOut}
      />

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white">
            <BookOpen size={18} aria-hidden="true" />
          </span>
          <span className="font-bold text-slate-800">Trung tâm ScienceHub</span>
        </div>
        {userProfile && (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
            {userProfile.teacher_name || roleLabel}
          </span>
        )}
      </header>

      <div className="lg:pl-64">
        {/* pb-24: chừa chỗ cho thanh tab đáy để không che nội dung */}
        <main className="mx-auto max-w-[96rem] p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav
        currentPage={currentPage}
        onNavigate={onNavigate}
        userProfile={userProfile}
        onOpenChangePassword={onOpenChangePassword}
        onSignOut={onSignOut}
      />
    </div>
  )
}