// Hỗ trợ lịch học và ngày giờ cho lớp học.
// Lịch học lưu ở bảng class_schedules: mỗi dòng = một ngày trong tuần + giờ của ngày đó.

// 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật (khớp cột class_schedules.day_of_week)
export const WEEK_DAYS = [
  { value: 2, short: 'T2', full: 'Thứ 2' },
  { value: 3, short: 'T3', full: 'Thứ 3' },
  { value: 4, short: 'T4', full: 'Thứ 4' },
  { value: 5, short: 'T5', full: 'Thứ 5' },
  { value: 6, short: 'T6', full: 'Thứ 6' },
  { value: 7, short: 'T7', full: 'Thứ 7' },
  { value: 8, short: 'CN', full: 'Chủ nhật' },
]

// "17:30:00" -> "17:30"
export function formatTime(value) {
  return value ? String(value).slice(0, 5) : ''
}

// Gom các dòng lịch theo lớp: { [class_id]: [dòng lịch xếp theo thứ] }
export function groupSchedulesByClass(rows) {
  const map = {}
  for (const row of rows ?? []) {
    if (!map[row.class_id]) map[row.class_id] = []
    map[row.class_id].push(row)
  }
  for (const list of Object.values(map)) list.sort((a, b) => a.day_of_week - b.day_of_week)
  return map
}

// rows: các dòng class_schedules của MỘT lớp.
//   Cùng giờ mọi ngày:  "T2, T4 · 17:30–19:00"
//   Khác giờ:           "T2 17:30–19:00 · T4, T6 18:00–19:30"
export function formatSchedule(rows) {
  if (!rows || rows.length === 0) return 'Chưa có lịch'

  const sorted = [...rows].sort((a, b) => a.day_of_week - b.day_of_week)
  const groups = []
  for (const row of sorted) {
    const time = `${formatTime(row.start_time)}–${formatTime(row.end_time)}`
    const day = WEEK_DAYS.find((item) => item.value === row.day_of_week)?.short
    if (!day) continue
    const group = groups.find((item) => item.time === time)
    if (group) group.days.push(day)
    else groups.push({ time, days: [day] })
  }

  if (groups.length === 1) return `${groups[0].days.join(', ')} · ${groups[0].time}`
  return groups.map((group) => `${group.days.join(', ')} ${group.time}`).join(' · ')
}

// Ngày hôm nay theo giờ máy người dùng, dạng "YYYY-MM-DD" (không dùng toISOString vì lệch múi giờ).
export function todayISO() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

// Ngày đầu tháng hiện tại, dạng "YYYY-MM-DD" (Giáo viên chỉ được thao tác từ ngày này trở đi).
export function monthStartISO() {
  return `${todayISO().slice(0, 7)}-01`
}

// ---- Hàm phục vụ điểm danh ----

// "YYYY-MM-DD" -> thứ trong tuần theo cột day_of_week (2..7 = Thứ 2..Thứ 7, 8 = Chủ nhật).
// Date.getDay() của JavaScript: 0 = Chủ nhật, 1..6 = Thứ 2..Thứ 7.
export function dayOfWeekFromISO(iso) {
  const [year, month, day] = String(iso).split('-').map(Number)
  const jsDay = new Date(year, month - 1, day).getDay()
  return jsDay === 0 ? 8 : jsDay + 1
}

// Cộng/trừ số ngày cho một ngày "YYYY-MM-DD".
export function addDaysISO(iso, days) {
  const [year, month, day] = String(iso).split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

// "Thứ 2", "Chủ nhật"... của một ngày "YYYY-MM-DD".
export function weekdayLabel(iso) {
  const value = dayOfWeekFromISO(iso)
  return WEEK_DAYS.find((item) => item.value === value)?.full ?? ''
}

// days: mảng số thứ trong tuần (2..8) mà lớp có học.
// Tìm ngày gần nhất theo hướng direction (-1 lùi, +1 tiến) có lịch học, bắt đầu từ ngày SAU fromISO.
// limitISO (tùy chọn): không vượt quá ngày này khi tiến. Không thấy thì trả về null.
export function findScheduledDate(days, fromISO, direction, limitISO) {
  if (!days || days.length === 0) return null
  for (let step = 1; step <= 60; step += 1) {
    const candidate = addDaysISO(fromISO, direction * step)
    if (limitISO && candidate > limitISO) return null
    if (days.includes(dayOfWeekFromISO(candidate))) return candidate
  }
  return null
}

// Ngày có lịch học gần nhất tính từ fromISO trở về trước (tính cả fromISO).
export function latestScheduledDate(days, fromISO) {
  if (!days || days.length === 0) return null
  if (days.includes(dayOfWeekFromISO(fromISO))) return fromISO
  return findScheduledDate(days, fromISO, -1)
}
