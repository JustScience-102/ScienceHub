import { LayoutDashboard, UserSquare, School, GraduationCap } from 'lucide-react'

// Danh sách màn hình chính. `short` dùng cho thanh tab dưới đáy trên điện thoại.
// `roles`: vai trò được thấy mục này (Giáo viên không có Tổng quan và Quản lý Giáo viên).
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Tổng quan', icon: LayoutDashboard, roles: ['manager'] },
  { id: 'teachers', label: 'Quản lý Giáo viên', short: 'Giáo viên', icon: UserSquare, roles: ['manager'] },
  { id: 'classes', label: 'Quản lý Lớp học', short: 'Lớp học', icon: School, roles: ['manager', 'teacher'] },
  { id: 'students', label: 'Quản lý Học sinh', short: 'Học sinh', icon: GraduationCap, roles: ['manager', 'teacher'] },
]

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
