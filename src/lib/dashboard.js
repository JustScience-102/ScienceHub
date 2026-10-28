// Hàm thuần phục vụ Dashboard. Mọi con số được Database tính sẵn
// (dashboard_summary, dashboard_schedule trong supabase/03_rpc_and_auth.sql).
// Doanh thu chỉ cộng attendance_records.price_snapshot, không đọc classes.price_per_session.

import { toVietnameseError } from './errors'

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
