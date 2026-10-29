// Nhật ký thay đổi: nhãn, bộ lọc, định dạng và gọi RPC query_audit_logs.
// Tiền được định dạng qua formatCurrency, ngày qua formatDate/todayISO (xem schedule.js).
import { supabase } from './supabaseClient'
import { formatCurrency, formatDate } from './format'
import { todayISO } from './schedule'

export const ACTION_GROUP_OPTIONS = [
  { value: '', label: 'Tất cả thao tác' },
  { value: 'attendance', label: 'Điểm danh (Có mặt / Vắng / Xóa)' },
  { value: 'makeup', label: 'Học bù' },
  { value: 'enrollment', label: 'Ghi danh · Cho nghỉ · Đổi lớp · Hoàn thành cuối cấp' },
  { value: 'class', label: 'Lớp học (Tạo / Sửa / Ẩn / Lịch học)' },
  { value: 'student', label: 'Học sinh & Phụ huynh' },
  { value: 'teacher', label: 'Giáo viên & Tài khoản đăng nhập' },
  { value: 'system', label: 'Hệ thống (Sao lưu · Khóa sổ · Năm học · Khôi phục)' },
]

export const ACTION_META = {
  attendance_create: { label: 'Điểm danh mới', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  attendance_update: { label: 'Sửa điểm danh', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  attendance_delete: { label: 'Xóa điểm danh', badge: 'bg-red-50 text-red-700 border-red-200' },
  makeup_record: { label: 'Học bù', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  makeup_cancel: { label: 'Hủy học bù', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  enrollment_create: { label: 'Ghi danh', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  enrollment_drop: { label: 'Cho nghỉ học', badge: 'bg-red-50 text-red-700 border-red-200' },
  enrollment_transfer: { label: 'Đổi lớp', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  enrollment_graduate: { label: 'Hoàn thành cuối cấp', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  class_create: { label: 'Tạo lớp học', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  class_update: { label: 'Sửa lớp học', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  class_hide: { label: 'Ẩn lớp học', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  class_restore: { label: 'Khôi phục lớp', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  class_schedule_update: { label: 'Đổi lịch học', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  student_create: { label: 'Tạo học sinh', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  student_update: { label: 'Sửa học sinh', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  student_hide: { label: 'Ẩn học sinh', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  student_restore: { label: 'Hiện lại học sinh', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  parent_update: { label: 'Sửa phụ huynh', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  teacher_create: { label: 'Thêm giáo viên', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  teacher_update: { label: 'Sửa giáo viên', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  teacher_hide: { label: 'Ẩn giáo viên', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  teacher_restore: { label: 'Khôi phục GV', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  teacher_account_link: { label: 'Liên kết TK GV', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  teacher_account_unlink: { label: 'Gỡ TK GV cũ', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  teacher_account_lock: { label: 'Khóa TK GV', badge: 'bg-red-50 text-red-700 border-red-200' },
  teacher_account_unlock: { label: 'Mở khóa TK GV', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  backup_export: { label: 'Xuất sao lưu', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  audit_log_clear: { label: 'Làm mới nhật ký', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  school_year_rollover: { label: 'Chuyển năm học', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  center_restore: { label: 'Khôi phục từ sao lưu', badge: 'bg-red-50 text-red-700 border-red-200' },
  month_close: { label: 'Chốt sổ tháng', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  month_reopen: { label: 'Mở lại sổ tháng', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export const ACTOR_ROLE_LABELS = {
  manager: 'Quản lý',
  teacher: 'Giáo viên',
  system: 'Hệ thống',
}

export function getActionMeta(action) {
  return (
    ACTION_META[action] || {
      label: action || 'Khác',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
    }
  )
}

export function getActorRoleLabel(role) {
  return ACTOR_ROLE_LABELS[role] || 'Khác'
}

// Kỳ Năm học của Trung tâm (15/06 -> 12/06 năm sau) tính từ "hôm nay" theo múi giờ máy người dùng.
export function getCurrentSchoolYearBounds(today = todayISO()) {
  const [yStr, mStr, dStr] = String(today).split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const day = Number(dStr)

  const isOnOrAfterJune15 = month > 6 || (month === 6 && day >= 15)
  const startYear = isOnOrAfterJune15 ? year : year - 1
  const endYear = startYear + 1

  return {
    schoolYear: `${startYear}-${endYear}`,
    startYear,
    endYear,
    startDate: `${startYear}-06-15`,
    endDate: `${endYear}-06-12`,
    label: `Năm học ${startYear} - ${endYear} (15/06/${startYear} – 12/06/${endYear})`,
  }
}

// 12/06 gần nhất đã qua tính từ một ngày "YYYY-MM-DD" (không dùng toISOString, không lệch múi giờ).
// Kỳ Năm học của Trung tâm là 15/06 -> 12/06 năm sau, nên ngày chốt mặc định là ngày 12/06 cuối cùng của Năm học.
export function latestSchoolYearEnd(today = todayISO()) {
  const [yStr, mStr, dStr] = String(today).split('-').map(Number)
  const thisJune12 = `${yStr}-06-12`
  // Ngày chốt phải là ngày đã qua (hàm xóa từ chối ngày hôm nay).
  if (mStr > 6 || (mStr === 6 && dStr > 12)) return thisJune12
  return `${yStr - 1}-06-12`
}

// "2026-10-27T03:55:47.000Z" -> "27/10/2026 10:55:47" theo múi giờ Việt Nam
export function formatVnDateTime(isoTimestamp) {
  if (!isoTimestamp) return '-'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(isoTimestamp))
    const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`
  } catch {
    return String(isoTimestamp)
  }
}

// Gộp các dòng cùng một lần bấm (cùng batch_id) thành một nhóm hiển thị gọn.
// Đổi lớp tạo 2 dòng (ghi danh + chuyển lớp) nên enrollment_create bị ẩn khi đã có
// enrollment_transfer của cùng học sinh trong giao dịch.
const GROUPABLE_ACTIONS = new Set(['attendance_create', 'attendance_update', 'attendance_delete', 'makeup_record'])

export function groupAuditItems(items) {
  const entries = []
  const transferKeys = new Set()
  for (const item of items) {
    if (item?.action === 'enrollment_transfer' && item?.batch_id != null && item?.student_id) {
      transferKeys.add(`${item.batch_id}|${item.student_id}`)
    }
  }

  const groups = new Map()
  for (const item of items) {
    const transferKey = `${item?.batch_id ?? ''}|${item?.student_id ?? ''}`
    if (item?.action === 'enrollment_create' && transferKeys.has(transferKey)) continue
    if (item?.action && GROUPABLE_ACTIONS.has(item.action)) {
      const key = [item.action, item.batch_id ?? '', item.actor_name ?? '', item.class_id ?? ''].join('|')
      const group = groups.get(key)
      if (group) {
        group.items.push(item)
        continue
      }
      const entry = { kind: 'group', key, action: item.action, batchId: item.batch_id, head: item, items: [item] }
      groups.set(key, entry)
      entries.push(entry)
      continue
    }
    entries.push({ kind: 'single', key: item?.id, item })
  }
  return entries
}

// "Điểm danh lớp X ngày D: 3 học sinh (Có mặt 2 · Vắng 1)" từ dòng đầu của nhóm
export function describeAuditGroup(entry) {
  const head = entry.head ?? {}
  const data = head.new_data ?? head.old_data ?? {}
  const className = data.class_name || ''
  const dateText = data.attendance_date ? formatDate(data.attendance_date) : ''
  const counts = { present: 0, absent: 0, excused: 0 }
  for (const item of entry.items) {
    const status = item.new_data?.status ?? item.old_data?.status
    if (status === 'present') counts.present += 1
    else if (status === 'absent') counts.absent += 1
    else if (status === 'absent_excused') counts.excused += 1
  }
  const parts = []
  if (counts.present > 0) parts.push(`Có mặt ${counts.present}`)
  if (counts.absent > 0) parts.push(`Vắng ${counts.absent}`)
  if (counts.excused > 0) parts.push(`Có phép ${counts.excused}`)
  const headLabel = head.action === 'makeup_record' ? 'Học bù' : 'Điểm danh'
  return `${headLabel} lớp ${className}${dateText ? ` ngày ${dateText}` : ''}: ${entry.items.length} học sinh${
    parts.length > 0 ? ` (${parts.join(' · ')})` : ''
  }`
}

const HIDDEN_PAYLOAD_KEYS = new Set([
  'attendance_id',
  'enrollment_id',
  'class_id',
  'student_id',
  'parent_id',
  'teacher_id',
  'user_id',
  'new_enrollment',
])

const FIELD_LABELS = {
  attendance_date: 'Ngày điểm danh',
  status: 'Trạng thái',
  price_snapshot: 'Đơn giá đóng băng',
  class_name: 'Lớp học',
  orig_class_name: 'Lớp gốc',
  from_class_name: 'Từ lớp',
  to_class_name: 'Sang lớp',
  transfer_date: 'Ngày chuyển lớp',
  student_code: 'Mã học sinh',
  student_name: 'Học sinh',
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  email: 'Email',
  grade: 'Khối',
  subject: 'Môn học',
  class_no: 'Thứ tự lớp',
  teacher_name: 'Giáo viên',
  price_per_session: 'Đơn giá / buổi',
  parent_name: 'Phụ huynh',
  parent_phone: 'SĐT phụ huynh',
  parent_code: 'Mã phụ huynh',
  joined_at: 'Ngày vào lớp',
  left_at: 'Ngày nghỉ học',
  active: 'Kích hoạt tài khoản',
  is_makeup: 'Học bù',
  schedule: 'Lịch học',
  deleted_at: 'Trạng thái ẩn',
  deleted_count: 'Số dòng nhật ký đã xóa',
  before_date: 'Ngày chốt nhật ký',
  rollover_date: 'Ngày chuyển năm học',
  promoted_count: 'Số lớp lên khối',
  closed_count: 'Số lớp cuối cấp đã đóng',
  dropped_students: 'Số học sinh cho nghỉ',
  file_exported_at: 'File sao lưu xuất lúc',
  restored_students: 'Số học sinh khôi phục',
  restored_classes: 'Số lớp khôi phục',
  restored_enrollments: 'Số ghi danh khôi phục',
  restored_attendance: 'Số buổi điểm danh khôi phục',
}

const STATUS_VALUE_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng (tính phí)',
  absent_excused: 'Vắng có phép (0đ)',
  active: 'Đang học',
  dropped: 'Đã nghỉ',
}

// [{key, label, value}] để hiện dữ liệu trước -> sau; ẩn các cột id kỹ thuật.
export function formatAuditPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const entries = []
  for (const [key, rawVal] of Object.entries(data)) {
    if (HIDDEN_PAYLOAD_KEYS.has(key) || key.endsWith('_id') || rawVal === undefined) continue
    const label = FIELD_LABELS[key] || key
    let display
    if (rawVal === null || rawVal === '') {
      display = 'Trống'
    } else if (key === 'price_snapshot' || key === 'price_per_session') {
      display = formatCurrency(rawVal)
    } else if (key === 'status' && STATUS_VALUE_LABELS[rawVal]) {
      display = STATUS_VALUE_LABELS[rawVal]
    } else if (key === 'deleted_at') {
      display = typeof rawVal === 'string' ? `Đã ẩn (${formatVnDateTime(rawVal)})` : 'Đã ẩn'
    } else if (typeof rawVal === 'boolean') {
      display = rawVal ? 'Có' : 'Không'
    } else if (
      (key.endsWith('_date') || key === 'joined_at' || key === 'left_at' || key === 'before_date') &&
      typeof rawVal === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(rawVal)
    ) {
      display = formatDate(rawVal)
    } else {
      display = String(rawVal)
    }
    entries.push({ key, label, value: display })
  }
  return entries
}

export async function fetchAuditLogs({
  fromDate = null,
  toDate = null,
  actorRole = null,
  teacherId = null,
  actionGroup = null,
  classId = null,
  studentId = null,
  search = null,
  limit = 100,
  offset = 0,
} = {}) {
  const { data, error } = await supabase.rpc('query_audit_logs', {
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
    p_actor_role: actorRole || null,
    p_teacher_id: teacherId || null,
    p_action_group: actionGroup || null,
    p_class_id: classId || null,
    p_student_id: studentId || null,
    p_search: search ? search.trim() : null,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) throw error
  return data || { total: 0, limit, offset, items: [] }
}

export async function fetchAllAuditLogsBefore({ beforeDate, onProgress } = {}) {
  if (!beforeDate) throw new Error('Vui lòng chọn ngày chốt nhật ký.')
  const items = []
  const limit = 500
  let offset = 0
  let total = 0
  for (;;) {
    const page = await fetchAuditLogs({ toDate: beforeDate, limit, offset })
    const batch = page?.items || []
    total = Number(page?.total || 0)
    if (batch.length === 0) break
    items.push(...batch)
    offset += batch.length
    onProgress?.({ loaded: items.length, total })
    if (items.length >= total || batch.length < limit) break
  }
  if (items.length < total) {
    throw new Error(
      'Trung tâm chưa tải hết nhật ký (mới có ' +
        items.length +
        '/' +
        total +
        ' dòng). Hãy thử lại, đừng xóa nhật ký khi tải chưa đủ.',
    )
  }
  return { total, items }
}

export async function clearAuditLogsBefore({ beforeDate, expectedCount, confirmText }) {
  const { data, error } = await supabase.rpc('clear_audit_logs_before', {
    p_before_date: beforeDate,
    p_expected_count: Number(expectedCount),
    p_confirm_text: confirmText,
  })
  if (error) throw error
  return data
}
