import { accountStatus } from '../../lib/teacherAccount'

// Nhãn trạng thái tài khoản đăng nhập của giáo viên (dùng ở danh sách và Hồ sơ giáo viên).
export default function AccountBadge({ profile }) {
  const status = accountStatus(profile)
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
  )
}
