// Hỗ trợ lịch học và ngày giờ cho lớp học.
// Lịch học lưu ở bảng class_schedules: mỗi dòng = một ngày trong tuần + giờ của ngày đó,
// có thời kỳ hiệu lực valid_from / valid_to (NULL = không giới hạn; valid_to NULL = lịch hiện hành).

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

// rows: các dòng class_schedules của MỘT lớp (mọi thời kỳ; chỉ hiện lịch đang áp dụng hôm nay).
//   Cùng giờ mọi ngày:  "T2, T4 · 17:30–19:00"
//   Khác giờ:           "T2 17:30–19:00 · T4, T6 18:00–19:30"
//   Có lịch mới sắp áp dụng: thêm " (lịch mới từ 05/11/2026)"
export function formatSchedule(rows) {
  const upcoming = upcomingScheduleFrom(rows)
  const text = formatScheduleRows(displaySchedules(rows))
  if (!upcoming) return text
  const [year, month, day] = upcoming.split('-')
  return `${text} (lịch mới từ ${day}/${month}/${year})`
}

// Định dạng đúng các dòng được đưa vào (không lọc thời kỳ).
export function formatScheduleRows(rows) {
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

// ---- Lịch theo thời kỳ ----

// Các dòng lịch có hiệu lực vào ngày dateISO.
export function schedulesOn(rows, dateISO) {
  return (rows ?? []).filter(
    (row) => (!row.valid_from || row.valid_from <= dateISO) && (!row.valid_to || row.valid_to >= dateISO),
  )
}

// Lịch hiện hành (đang áp dụng hoặc sẽ áp dụng từ valid_from): dùng cho form Sửa lớp.
export function currentSchedules(rows) {
  return (rows ?? []).filter((row) => !row.valid_to)
}

// Lịch để hiển thị: lịch có hiệu lực hôm nay; nếu lịch mới chưa tới ngày áp dụng thì vẫn hiện lịch hôm nay.
export function displaySchedules(rows, todayValue = todayISO()) {
  const today = schedulesOn(rows, todayValue)
  return today.length > 0 ? today : currentSchedules(rows)
}

// Lịch mới sẽ áp dụng từ một ngày trong tương lai (nếu có): "YYYY-MM-DD" hoặc ''.
export function upcomingScheduleFrom(rows, todayValue = todayISO()) {
  const starts = currentSchedules(rows)
    .map((row) => row.valid_from)
    .filter((value) => value && value > todayValue)
  return starts.length > 0 ? starts.sort()[0] : ''
}

// Lớp có buổi học vào ngày dateISO không (theo lịch hiệu lực của ngày đó).
export function hasSessionOn(rows, dateISO) {
  const day = dayOfWeekFromISO(dateISO)
  return schedulesOn(rows, dateISO).some((row) => row.day_of_week === day)
}

// Như findScheduledDate nhưng theo lịch thời kỳ: ngày gần nhất SAU fromISO (theo hướng direction) có buổi học.
export function findSessionDate(rows, fromISO, direction, limitISO) {
  if (!rows || rows.length === 0) return null
  for (let step = 1; step <= 60; step += 1) {
    const candidate = addDaysISO(fromISO, direction * step)
    if (limitISO && candidate > limitISO) return null
    if (hasSessionOn(rows, candidate)) return candidate
  }
  return null
}

// Ngày có buổi học gần nhất từ fromISO trở về trước (tính cả fromISO).
export function latestSessionDate(rows, fromISO) {
  if (hasSessionOn(rows, fromISO)) return fromISO
  return findSessionDate(rows, fromISO, -1)
}
