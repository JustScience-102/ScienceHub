// Tính học phí theo tháng cho hồ sơ học sinh.
// Quy tắc: MỌI số tiền chỉ cộng từ attendance_records.price_snapshot (giá đã đóng băng),
// KHÔNG BAO GIỜ lấy từ classes.price_per_session. Vắng có phép không tính tiền.
// Toàn bộ hàm ở đây là hàm thuần (không gọi Database) để Dashboard dùng lại được.

import { addDaysISO, hasSessionOn } from './schedule'

export const STATUS_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng',
  absent_excused: 'Vắng có phép',
}

// ---- Tháng / năm (tính theo chuỗi, không dùng toISOString nên không lệch múi giờ) ----

// "2026-10-27" -> { year: 2026, month: 10 }
export function monthOf(iso) {
  const [year, month] = String(iso).split('-').map(Number)
  return { year, month }
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

// Ngày đầu tháng: "2026-10-01"
export function monthStart({ year, month }) {
  return `${year}-${pad2(month)}-01`
}

// Ngày đầu của tháng SAU: dùng làm cận trên loại trừ [ngày 1, ngày 1 tháng sau)
export function nextMonthStart({ year, month }) {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`
}

// Cộng/trừ số tháng: shiftMonth({year: 2026, month: 1}, -1) -> {year: 2025, month: 12}
export function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function monthLabel({ year, month }) {
  return `Tháng ${month}/${year}`
}

export function sameMonth(a, b) {
  return a.year === b.year && a.month === b.month
}

// ---- Tiền ----

// Số tiền tính của một bản ghi điểm danh: chỉ price_snapshot, trống (NULL) thì 0.
export function recordAmount(record) {
  if (!record || record.status === 'absent_excused') return 0
  return Number(record.price_snapshot) || 0
}

// Học bù: bản ghi nằm ở lớp bù (class_id) nhưng enrollment_id trỏ về ghi danh của lớp GỐC.
export function isMakeupRecord(record, enrollmentById) {
  const enrollment = enrollmentById[record.enrollment_id]
  return Boolean(enrollment) && enrollment.class_id !== record.class_id
}

// Gom bản ghi điểm danh trong tháng theo LỚP GỐC (học bù được tính vào lớp gốc).
// enrollments: mọi dòng ghi danh của học sinh (kể cả đã nghỉ), có kèm classes(...).
// records: bản ghi điểm danh của học sinh trong tháng, có kèm classes(name) của lớp nơi bản ghi nằm.
// Trả về { groups, total, presentCount, absentCount, excusedCount, chargedCount },
// groups xếp: lớp đang học trước, lớp đã nghỉ sau, mỗi nhóm theo tên lớp.
export function summarizeMonth(enrollments, records) {
  const enrollmentById = {}
  const classInfo = {}
  const hasActive = {}
  for (const enrollment of enrollments) {
    enrollmentById[enrollment.id] = enrollment
    if (enrollment.classes) classInfo[enrollment.class_id] = enrollment.classes
    if (enrollment.status === 'active') hasActive[enrollment.class_id] = true
  }

  const byClass = {}
  for (const record of records) {
    const enrollment = enrollmentById[record.enrollment_id]
    const classId = enrollment ? enrollment.class_id : record.class_id
    if (!byClass[classId]) {
      byClass[classId] = {
        classId,
        cls: classInfo[classId] ?? record.classes ?? null,
        active: Boolean(hasActive[classId]),
        rows: [],
        total: 0,
        chargedCount: 0,
        presentCount: 0,
        absentCount: 0,
        excusedCount: 0,
      }
    }
    const group = byClass[classId]
    const amount = recordAmount(record)
    const makeup = isMakeupRecord(record, enrollmentById)
    group.rows.push({
      id: record.id,
      date: record.attendance_date,
      status: record.status,
      amount,
      makeup,
      makeupClassName: makeup ? record.classes?.name ?? '' : '',
    })
    group.total += amount
    if (record.status === 'present') {
      group.presentCount += 1
      group.chargedCount += 1
    } else if (record.status === 'absent') {
      group.absentCount += 1
      group.chargedCount += 1
    } else if (record.status === 'absent_excused') {
      group.excusedCount += 1
    }
  }

  const groups = Object.values(byClass)
  for (const group of groups) group.rows.sort((a, b) => a.date.localeCompare(b.date))
  groups.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return String(a.cls?.name ?? '').localeCompare(String(b.cls?.name ?? ''), 'vi')
  })

  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    presentCount: groups.reduce((sum, group) => sum + group.presentCount, 0),
    absentCount: groups.reduce((sum, group) => sum + group.absentCount, 0),
    excusedCount: groups.reduce((sum, group) => sum + group.excusedCount, 0),
    chargedCount: groups.reduce((sum, group) => sum + group.chargedCount, 0),
  }
}

// ---- Số buổi còn lại theo lịch (chỉ đếm buổi, KHÔNG quy ra tiền) ----

// Đếm số buổi từ hôm nay đến hết tháng đang xem mà lớp có lịch và học sinh chưa có bản ghi điểm danh.
// activeEnrollments: ghi danh 'active', có classes(class_schedules(day_of_week, valid_from, valid_to)):
// mỗi ngày được kiểm theo lịch hiệu lực của chính ngày đó (lịch theo thời kỳ).
// records: bản ghi điểm danh trong tháng (để bỏ qua buổi đã có bản ghi, kể cả Vắng có phép xin trước).
// Trả về { [class_id]: số buổi }. Tháng đã qua hoàn toàn thì mọi lớp là 0.
export function remainingSessions(activeEnrollments, records, today, month) {
  const result = {}
  const monthEnd = addDaysISO(nextMonthStart(month), -1)
  const from = today > monthStart(month) ? today : monthStart(month)

  const recorded = new Set(records.map((record) => `${record.class_id}|${record.attendance_date}`))

  for (const enrollment of activeEnrollments) {
    const classId = enrollment.class_id
    const schedules = enrollment.classes?.class_schedules ?? []
    let count = 0
    if (schedules.length > 0 && from <= monthEnd) {
      for (let date = from; date <= monthEnd; date = addDaysISO(date, 1)) {
        if (date < enrollment.joined_at) continue
        if (!hasSessionOn(schedules, date)) continue
        if (recorded.has(`${classId}|${date}`)) continue
        count += 1
      }
    }
    result[classId] = (result[classId] ?? 0) + count
  }
  return result
}