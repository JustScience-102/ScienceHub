import BrandLogo from '../BrandLogo'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

// Khung chung: thanh bên (máy tính) + thanh tiêu đề gọn và thanh tab đáy (điện thoại).
export default function AppLayout({
  currentPage,
  onNavigate,
  userProfile,
  onOpenChangePassword,
  onSignOut,
  badges = {},
  children,
}) {
  const roleLabel = userProfile?.role === 'manager' ? 'Quản lý' : 'Giáo viên'

  return (
    <div className="min-h-dvh bg-slate-50">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        userProfile={userProfile}
        onOpenChangePassword={onOpenChangePassword}
        onSignOut={onSignOut}
        badges={badges}
      />

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-8 w-8 rounded-lg" />
          <span className="font-bold text-slate-800">Lớp học ScienceHub</span>
        </div>
        {userProfile && (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
            {userProfile.teacher_name || roleLabel}
          </span>
        )}
      </header>

      <div className="lg:pl-64">
        {/* pb-[calc(5rem+...)]: chừa chỗ cho thanh tab đáy (kể cả vùng an toàn) để không che nội dung */}
        <main className="mx-auto max-w-[96rem] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav
        currentPage={currentPage}
        onNavigate={onNavigate}
        userProfile={userProfile}
        onOpenChangePassword={onOpenChangePassword}
        onSignOut={onSignOut}
        badges={badges}
      />
    </div>
  )
}