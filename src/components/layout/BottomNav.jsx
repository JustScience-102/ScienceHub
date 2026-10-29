import { useEffect, useState } from 'react'
import { KeyRound, LogOut, UserCircle } from 'lucide-react'
import { navItemsFor } from './navItems'

const ROLE_LABELS = { manager: 'Quản lý', teacher: 'Giáo viên' }

// Ô nhập chữ làm bật bàn phím ảo (checkbox, radio, file... thì không).
const KEYBOARD_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'tel', 'url', 'number', 'date', 'time', 'month', '',
])
function opensKeyboard(element) {
  if (!element) return false
  if (element.tagName === 'TEXTAREA') return true
  return element.tagName === 'INPUT' && KEYBOARD_INPUT_TYPES.has(element.type)
}

// Thanh tab cố định ở đáy màn hình, chỉ hiện trên điện thoại/máy tính bảng (dưới 1024px).
// Tab cuối "Tài khoản" mở menu nhỏ: thông tin người dùng, Đổi mật khẩu, Đăng xuất.
export default function BottomNav({
  currentPage,
  onNavigate,
  userProfile,
  onOpenChangePassword,
  onSignOut,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Đang gõ vào ô nhập: ẩn thanh tab để nó không nổi ngay trên bàn phím ảo và ăn mất chỗ.
  const [typing, setTyping] = useState(false)
  const displayName = userProfile?.teacher_name || userProfile?.email || ''
  const roleLabel = ROLE_LABELS[userProfile?.role] ?? ''
  const items = navItemsFor(userProfile?.role)
  // Quản lý: 4 mục + Tài khoản = 5 cột; Giáo viên: 2 mục + Tài khoản = 3 cột.
  const gridCols = items.length >= 4 ? 'grid-cols-5' : 'grid-cols-3'

  useEffect(() => {
    function handleFocusIn(event) {
      setTyping(opensKeyboard(event.target))
    }
    function handleFocusOut() {
      setTyping(false)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  return (
    <>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Đóng menu tài khoản"
            onClick={() => setMenuOpen(false)}
            className="lg:hidden fixed inset-0 z-20 cursor-default bg-slate-900/30"
          />
          <div
            role="menu"
            aria-label="Tài khoản"
            className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-2 z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          >
            <div className="mb-2 border-b border-slate-100 px-2 pb-2">
              <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
              <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                {roleLabel}
              </span>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onOpenChangePassword()
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <KeyRound size={18} aria-hidden="true" />
              Đổi mật khẩu
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onSignOut()
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <LogOut size={18} aria-hidden="true" />
              Đăng xuất
            </button>
          </div>
        </>
      )}

      <nav
        aria-label="Điều hướng chính"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] ${
          typing ? 'hidden' : ''
        }`}
      >
        <ul className={`grid ${gridCols}`}>
          {items.map((item) => {
            const Icon = item.icon
            const active = item.id === currentPage
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onNavigate(item.id)
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors ${
                    active ? 'text-sky-600 bg-sky-50' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>{item.short}</span>
                </button>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`flex w-full min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors ${
                menuOpen ? 'text-sky-600 bg-sky-50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <UserCircle size={22} aria-hidden="true" />
              <span>Tài khoản</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  )
}
