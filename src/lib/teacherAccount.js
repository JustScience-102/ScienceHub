// Trạng thái tài khoản đăng nhập của một giáo viên, suy ra từ dòng profiles (role = 'teacher').
//   Chưa cấp tài khoản: chưa có dòng profiles  |  Đang hoạt động: active = true  |  Đã khóa: active = false
export function accountStatus(profile) {
  if (!profile) return { key: 'none', label: 'Chưa cấp tài khoản', tone: 'bg-slate-100 text-slate-600' }
  if (profile.active) return { key: 'active', label: 'Đang hoạt động', tone: 'bg-emerald-50 text-emerald-700' }
  return { key: 'locked', label: 'Đã khóa', tone: 'bg-red-50 text-red-700' }
}
