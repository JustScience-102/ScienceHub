// Đơn đăng ký học gửi từ trang giới thiệu sciencehub.id.vn (ARCHITECTURE.md mục 5.2): hàm thuần cho trang
// Đơn đăng ký (pages/RegistrationsPage.jsx). Test: scripts/test-js.mjs.

export const REGISTRATION_STATUSES = [
  { id: 'new', label: 'Mới', tone: 'bg-sky-100 text-sky-800' },
  { id: 'contacted', label: 'Đã liên hệ', tone: 'bg-amber-100 text-amber-800' },
  { id: 'enrolled', label: 'Đã xếp lớp', tone: 'bg-emerald-100 text-emerald-800' },
  { id: 'cancelled', label: 'Đã hủy', tone: 'bg-slate-100 text-slate-600' },
]

export function statusInfo(id) {
  return REGISTRATION_STATUSES.find((s) => s.id === id) ?? { id, label: id, tone: 'bg-slate-100 text-slate-600' }
}

const DAY_LABELS = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'Chủ nhật' }

export function scheduleText(schedule) {
  return (schedule ?? []).map((s) => `${DAY_LABELS[s.day] ?? `Thứ ${s.day}`} ${s.start}–${s.end}`).join(', ') || 'chưa có lịch'
}

// Lựa chọn của phụ huynh (ảnh chụp lúc gửi) gom theo môn + khối, giữ thứ tự phần.
//   -> [{ key, title: 'Vật Lí 12', items: [{ classId, label: 'Nhóm 1 · Phần 1', text: 'Thứ 2 17:00–19:00' }] }]
export function groupChoices(choices) {
  const groups = new Map()
  for (const c of choices ?? []) {
    const key = `${c.subject}|${c.grade}`
    if (!groups.has(key)) groups.set(key, { key, title: `${c.subject} ${c.grade}`, items: [] })
    const name = c.class_no == null ? 'Lớp' : `Nhóm ${c.class_no}`
    groups.get(key).items.push({
      classId: c.class_id,
      label: c.part == null ? name : `${name} · Phần ${c.part}`,
      text: scheduleText(c.schedule),
      part: c.part ?? 0,
    })
  }
  return [...groups.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => a.part - b.part) }))
}

// Thời điểm theo giờ Việt Nam: "25/11/2026 14:05".
export function formatDateTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

// Đếm đơn theo trạng thái (cho các nút lọc).
export function countByStatus(items) {
  const counts = { all: items.length }
  for (const s of REGISTRATION_STATUSES) counts[s.id] = 0
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1
  return counts
}
