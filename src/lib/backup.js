// Sao lưu thủ công: tải JSON toàn hệ thống và xuất CSV mở bằng Excel (UTF-8 có BOM).
// Quy ước: ngày dùng formatDate (DD/MM/YYYY), "hôm nay" dùng todayISO (không dùng toISOString),
// học sinh sắp theo TÊN gọi (compareVietnameseNames), tiền cộng từ price_snapshot đóng băng (do Database tính).
import { supabase } from './supabaseClient'
import { formatDate } from './format'
import { compareVietnameseNames } from './text'
import { todayISO } from './schedule'
import { fetchAllAuditLogsBefore, formatVnDateTime, getActionMeta, getActorRoleLabel } from './auditLog'

const DAY_LABELS = {
  2: 'Thứ 2',
  3: 'Thứ 3',
  4: 'Thứ 4',
  5: 'Thứ 5',
  6: 'Thứ 6',
  7: 'Thứ 7',
  8: 'Chủ nhật',
}

// ---- CSV ----

// Ô văn bản: chặn "formula injection" (Excel chạy công thức nếu ô bắt đầu bằng = + - @).
// Giáo viên được tạo học sinh nên không thể tin dữ liệu nhập vào là an toàn khi Quản lý mở bằng Excel.
function safeText(value) {
  const str = String(value)
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
}

function quoteCsv(str) {
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// header.type: 'text' (mặc định) | 'phone' (giữ số 0 đầu trong Excel) | 'number'
function csvCell(value, type = 'text') {
  if (value === null || value === undefined || value === '') return ''
  if (type === 'number') return quoteCsv(String(Number(value) || 0))
  if (type === 'phone') {
    const digits = String(value).trim()
    return /^\d+$/.test(digits) ? quoteCsv(`="${digits}"`) : quoteCsv(safeText(digits))
  }
  return quoteCsv(safeText(value))
}

// Gắn UTF-8 BOM để Excel trên Windows/macOS nhận đúng tiếng Việt có dấu.
export function buildCsvContent(headers, rows) {
  const headerLine = headers.map((header) => quoteCsv(header.label)).join(',')
  const bodyLines = rows.map((row) => headers.map((header) => csvCell(row[header.key], header.type)).join(','))
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n')
}

export function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function downloadCsv(headers, rows, filename) {
  triggerFileDownload(buildCsvContent(headers, rows), filename, 'text/csv;charset=utf-8')
}

function downloadJson(payload, filename) {
  triggerFileDownload(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8')
}

async function exportTables(tables, includeAuditLog = false) {
  const { data, error } = await supabase.rpc('export_center_backup', {
    p_include_audit_log: includeAuditLog,
    p_tables: tables,
  })
  if (error) throw error
  return data?.tables ?? {}
}

// ---- 1. Sao lưu toàn bộ Trung tâm (.json) ----
export async function downloadFullCenterBackupJson({ includeAuditLog = true } = {}) {
  const { data, error } = await supabase.rpc('export_center_backup', {
    p_include_audit_log: includeAuditLog,
    p_tables: null,
  })
  if (error) throw error
  const filename = `sciencehub_backup_${todayISO()}.json`
  downloadJson(data, filename)
  return { filename, counts: data?.metadata?.counts ?? {} }
}

// ---- 2. Sao lưu nhật ký đến hết ngày chốt, trước khi xóa để giải phóng dung lượng ----
// Trả về số dòng đã tải: đúng số này được gửi lên Database để đối chiếu trước khi xóa.
export async function downloadAuditBackup({ beforeDate, format = 'json', onProgress } = {}) {
  const { total, items } = await fetchAllAuditLogsBefore({ beforeDate, onProgress })
  const baseName = `sciencehub_nhat_ky_den_${beforeDate}_${todayISO()}`

  if (items.length === 0) {
    return { filename: '', count: 0, total }
  }

  if (format === 'csv') {
    const headers = [
      { key: 'created_at', label: 'Thời gian (VN)' },
      { key: 'actor_name', label: 'Người thực hiện' },
      { key: 'actor_role', label: 'Vai trò' },
      { key: 'action_label', label: 'Loại thao tác' },
      { key: 'summary', label: 'Nội dung chi tiết' },
      { key: 'old_data', label: 'Dữ liệu cũ (JSON)' },
      { key: 'new_data', label: 'Dữ liệu mới (JSON)' },
    ]
    const rows = items.map((item) => ({
      created_at: formatVnDateTime(item.created_at),
      actor_name: item.actor_name,
      actor_role: getActorRoleLabel(item.actor_role),
      action_label: getActionMeta(item.action).label,
      summary: item.summary,
      old_data: item.old_data ? JSON.stringify(item.old_data) : '',
      new_data: item.new_data ? JSON.stringify(item.new_data) : '',
    }))
    const filename = `${baseName}.csv`
    downloadCsv(headers, rows, filename)
    return { filename, count: items.length, total }
  }

  const filename = `${baseName}.json`
  downloadJson(
    {
      center: 'Trung tâm ScienceHub',
      before_date: beforeDate,
      exported_at: new Date().toISOString(),
      total_records: items.length,
      items,
    },
    filename,
  )
  return { filename, count: items.length, total }
}

// ---- 3. CSV Học sinh & Phụ huynh (sắp theo TÊN gọi) ----
export async function downloadStudentsCsv() {
  const tables = await exportTables(['students', 'parents', 'classes', 'class_enrollments'])

  const parentsById = new Map((tables.parents ?? []).map((parent) => [parent.id, parent]))
  const classesById = new Map((tables.classes ?? []).map((cls) => [cls.id, cls]))
  const activeClassesByStudent = new Map()
  for (const enrollment of tables.class_enrollments ?? []) {
    if (enrollment.status !== 'active') continue
    const name = classesById.get(enrollment.class_id)?.name
    if (!name) continue
    const list = activeClassesByStudent.get(enrollment.student_id) ?? []
    list.push(name)
    activeClassesByStudent.set(enrollment.student_id, list)
  }

  const headers = [
    { key: 'student_code', label: 'Mã HS' },
    { key: 'full_name', label: 'Họ và tên học sinh' },
    { key: 'grade', label: 'Khối' },
    { key: 'phone', label: 'SĐT học sinh', type: 'phone' },
    { key: 'active_classes', label: 'Các lớp đang học' },
    { key: 'parent_code', label: 'Mã PH' },
    { key: 'parent_name', label: 'Họ tên phụ huynh' },
    { key: 'parent_phone', label: 'SĐT phụ huynh', type: 'phone' },
    { key: 'status', label: 'Trạng thái' },
  ]

  const rows = [...(tables.students ?? [])]
    .sort((a, b) => compareVietnameseNames(a.full_name, b.full_name))
    .map((student) => {
      const parent = parentsById.get(student.parent_id)
      return {
        student_code: student.student_code,
        full_name: student.full_name,
        grade: student.grade ?? '',
        phone: student.phone ?? '',
        active_classes: (activeClassesByStudent.get(student.id) ?? []).join('; '),
        parent_code: parent?.parent_code ?? '',
        parent_name: parent?.full_name ?? '',
        parent_phone: parent?.phone ?? '',
        status: student.deleted_at ? 'Đã ẩn (nghỉ hết các lớp)' : 'Đang học',
      }
    })

  const filename = `sciencehub_hoc_sinh_${todayISO()}.csv`
  downloadCsv(headers, rows, filename)
  return { filename, count: rows.length }
}

// ---- 4. CSV Lớp học & Lịch học ----
export async function downloadClassesCsv() {
  const tables = await exportTables(['classes', 'teachers', 'class_schedules', 'class_enrollments'])

  const teachersById = new Map((tables.teachers ?? []).map((teacher) => [teacher.id, teacher]))
  const scheduleByClass = new Map()
  for (const row of tables.class_schedules ?? []) {
    const list = scheduleByClass.get(row.class_id) ?? []
    list.push(row)
    scheduleByClass.set(row.class_id, list)
  }
  const activeCountByClass = new Map()
  for (const enrollment of tables.class_enrollments ?? []) {
    if (enrollment.status === 'active') {
      activeCountByClass.set(enrollment.class_id, (activeCountByClass.get(enrollment.class_id) ?? 0) + 1)
    }
  }

  const headers = [
    { key: 'name', label: 'Tên lớp' },
    { key: 'subject', label: 'Môn học' },
    { key: 'grade', label: 'Khối' },
    { key: 'teacher_name', label: 'Giáo viên phụ trách' },
    { key: 'price_per_session', label: 'Đơn giá hiện tại (VNĐ)', type: 'number' },
    { key: 'active_students', label: 'Sĩ số đang học', type: 'number' },
    { key: 'schedule', label: 'Lịch học trong tuần' },
    { key: 'status', label: 'Trạng thái' },
  ]

  const rows = [...(tables.classes ?? [])]
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'vi'))
    .map((cls) => {
      const schedule = [...(scheduleByClass.get(cls.id) ?? [])]
        .sort((a, b) => a.day_of_week - b.day_of_week)
        .map(
          (row) =>
            `${DAY_LABELS[row.day_of_week] ?? `Thứ ${row.day_of_week}`} (${String(row.start_time).slice(0, 5)}-${String(row.end_time).slice(0, 5)})`,
        )
      return {
        name: cls.name,
        subject: cls.subject ?? '',
        grade: cls.grade ?? '',
        teacher_name: teachersById.get(cls.teacher_id)?.full_name ?? '',
        price_per_session: cls.price_per_session ?? 0,
        active_students: activeCountByClass.get(cls.id) ?? 0,
        schedule: schedule.join('; '),
        status: cls.deleted_at ? 'Đã ẩn' : 'Đang hoạt động',
      }
    })

  const filename = `sciencehub_lop_hoc_${todayISO()}.csv`
  downloadCsv(headers, rows, filename)
  return { filename, count: rows.length }
}

// ---- 5. CSV Điểm danh & Học phí theo tháng (Database cộng từ price_snapshot đóng băng) ----
export async function downloadMonthlyAttendanceTuitionCsv(year, month) {
  const { data, error } = await supabase.rpc('export_monthly_attendance_report', {
    p_year: Number(year),
    p_month: Number(month),
  })
  if (error) throw error

  const headers = [
    { key: 'class_name', label: 'Lớp học' },
    { key: 'subject', label: 'Môn' },
    { key: 'grade', label: 'Khối' },
    { key: 'teacher_name', label: 'Giáo viên' },
    { key: 'student_code', label: 'Mã HS' },
    { key: 'student_name', label: 'Họ tên học sinh' },
    { key: 'parent_code', label: 'Mã PH' },
    { key: 'parent_name', label: 'Phụ huynh' },
    { key: 'parent_phone', label: 'SĐT phụ huynh', type: 'phone' },
    { key: 'present_count', label: 'Số buổi Có mặt', type: 'number' },
    { key: 'makeup_count', label: 'Số buổi Học bù', type: 'number' },
    { key: 'absent_count', label: 'Số buổi Vắng (tính phí)', type: 'number' },
    { key: 'excused_count', label: 'Số buổi Có phép (0đ)', type: 'number' },
    { key: 'charged_sessions', label: 'Tổng số buổi tính phí', type: 'number' },
    { key: 'total_tuition', label: 'Tổng học phí tháng (VNĐ)', type: 'number' },
    { key: 'enrollment_status', label: 'Trạng thái ghi danh' },
  ]

  const rows = [...(data?.rows ?? [])]
    .sort(
      (a, b) =>
        String(a.class_name ?? '').localeCompare(String(b.class_name ?? ''), 'vi') ||
        compareVietnameseNames(a.student_name, b.student_name),
    )
    .map((row) => ({
      ...row,
      enrollment_status: row.enrollment_status === 'active' ? 'Đang học' : `Đã nghỉ (${formatDate(row.left_at)})`,
    }))

  const filename = `sciencehub_diem_danh_hoc_phi_${year}-${String(month).padStart(2, '0')}.csv`
  downloadCsv(headers, rows, filename)
  return { filename, count: rows.length }
}
