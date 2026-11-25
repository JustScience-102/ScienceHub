import { LayoutDashboard, UserSquare, School, GraduationCap, ClipboardList } from 'lucide-react'

// Danh sách màn hình chính. `short` dùng cho thanh tab dưới đáy trên điện thoại.
// `roles`: vai trò được thấy mục này (Giáo viên không có Tổng quan và Quản lý Giáo viên).
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Tổng quan', icon: LayoutDashboard, roles: ['manager'] },
  { id: 'teachers', label: 'Quản lý Giáo viên', short: 'Giáo viên', icon: UserSquare, roles: ['manager'] },
  { id: 'classes', label: 'Quản lý Lớp học', short: 'Lớp học', icon: School, roles: ['manager', 'teacher'] },
  { id: 'students', label: 'Quản lý Học sinh', short: 'Học sinh', icon: GraduationCap, roles: ['manager', 'teacher'] },
  // Đơn phụ huynh gửi từ trang giới thiệu sciencehub.id.vn (số đơn mới hiện cạnh mục, xem App.jsx).
  { id: 'registrations', label: 'Đơn đăng ký', short: 'Đơn ĐK', icon: ClipboardList, roles: ['manager'] },
]

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
