// Hàm thuần phục vụ Dashboard. Mọi con số được Database tính sẵn
// (dashboard_summary, dashboard_schedule trong supabase/03_rpc_and_auth.sql).
// Doanh thu chỉ cộng attendance_records.price_snapshot, không đọc classes.price_per_session.

import { toVietnameseError } from './errors'
import { normalizeText } from './text'

// Đưa kết quả jsonb của dashboard_summary về số, tránh phụ thuộc kiểu dữ liệu trả về.
export function parseSummary(raw) {
  const data = raw ?? {}
  return {
    monthStart: data.month_start ?? '',
    asOf: data.as_of ?? '',
    classCount: Number(data.class_count) || 0,
    teacherCount: Number(data.teacher_count) || 0,
    studentCount: Number(data.student_count) || 0,
    newStudents: Number(data.new_students) || 0,
    droppedStudents: Number(data.dropped_students) || 0,
    revenue: Number(data.revenue) || 0,
    chargedSessions: Number(data.charged_sessions) || 0,
  }
}

// Trạng thái điểm danh của một dòng trong "Lịch học trong ngày".
// tone dùng để chọn màu nhãn ở giao diện.
export function attendanceStatus(row, date, today) {
  const total = Number(row.total_count) || 0
  const marked = Number(row.marked_count) || 0
  if (date > today) return { label: 'Chưa đến ngày học', tone: 'muted' }
  if (total === 0 && marked === 0) return { label: 'Chưa có học sinh', tone: 'muted' }
  if (marked === 0) return { label: 'Chưa điểm danh', tone: 'warning' }
  if (marked < total) return { label: `Đã điểm danh ${marked}/${total}`, tone: 'info' }
  return { label: `Đã điểm danh đủ ${marked}/${total}`, tone: 'done' }
}

// Mỗi môn một màu pastel cố định. Môn chưa khai báo lấy màu theo tên (ổn định giữa các lần tải).
const SUBJECT_COLORS = {
  'vat li': 'bg-sky-100 text-sky-800',
  'hoa hoc': 'bg-emerald-100 text-emerald-800',
  toan: 'bg-rose-100 text-rose-800',
  'sinh hoc': 'bg-lime-100 text-lime-800',
  'ngu van': 'bg-amber-100 text-amber-800',
  'tieng anh': 'bg-violet-100 text-violet-800',
}
const FALLBACK_COLORS = [
  'bg-teal-100 text-teal-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
  'bg-cyan-100 text-cyan-800',
]

export function subjectColor(subject) {
  const key = normalizeText(subject).toLowerCase()
  if (!key) return 'bg-slate-100 text-slate-700'
  if (SUBJECT_COLORS[key]) return SUBJECT_COLORS[key]
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

// Tên lớp thân thiện: "Vật Lí 11 Nhóm 2". Nhóm lấy từ class_no, hoặc từ STT cuối tên lớp (Môn_Khối_GV_STT).
// Lớp cũ chưa có môn học thì giữ nguyên tên lớp.
export function classTitle(cls) {
  if (!cls.subject) return cls.name
  const group = cls.class_no ?? /_(\d+)$/.exec(cls.name ?? '')?.[1]
  return [cls.subject, cls.grade, group && `Nhóm ${group}`].filter(Boolean).join(' ')
}

// Báo lỗi Dashboard. Thiếu hàm thì chỉ rõ file cần chạy; lỗi khác dùng errors.js.
export function dashboardError(error) {
  if (!error) return ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  const missingFunction =
    error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(text)
  if (missingFunction && /dashboard_summary|dashboard_schedule|student_presence_spans/.test(text)) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  }
  return toVietnameseError(error)
}
