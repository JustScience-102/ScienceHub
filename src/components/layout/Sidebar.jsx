import { BookOpen, KeyRound, LogOut } from 'lucide-react'
import { navItemsFor } from './navItems'

const ROLE_LABELS = { manager: 'Quản lý', teacher: 'Giáo viên' }

// Thanh điều hướng dọc bên trái, chỉ hiện trên màn hình máy tính (từ 1024px).
export default function Sidebar({
  currentPage,
  onNavigate,
  userProfile,
  onOpenChangePassword,
  onSignOut,
}) {
  const displayName = userProfile?.teacher_name || userProfile?.email || ''
  const roleLabel = ROLE_LABELS[userProfile?.role] ?? ''

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-200">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500 text-white">
          <BookOpen size={20} aria-hidden="true" />
        </span>
        <span className="text-lg font-bold text-slate-800">Trung tâm ScienceHub</span>
      </div>

      <nav aria-label="Điều hướng chính" className="flex-1 p-4 space-y-1">
        {navItemsFor(userProfile?.role).map((item) => {
          const Icon = item.icon
          const active = item.id === currentPage
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        {userProfile && (
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-semibold text-slate-800" title={displayName}>
              {displayName}
            </p>
            {userProfile.teacher_name && userProfile.email && (
              <p className="truncate text-xs text-slate-500" title={userProfile.email}>
                {userProfile.email}
              </p>
            )}
            <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
              {roleLabel}
            </span>
          </div>
        )}
        <div className="space-y-1">
          <button
            type="button"
            onClick={onOpenChangePassword}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
          >
            <KeyRound size={18} aria-hidden="true" />
            Đổi mật khẩu
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={18} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </div>
    </aside>
  )
}
