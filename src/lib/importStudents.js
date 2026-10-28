// Nhập học sinh hàng loạt từ file CSV (V2-5): đọc file, chuẩn hóa dữ liệu, gọi RPC kiểm tra / nhập.
// Database kiểm tra lại toàn bộ (import_students_bulk) nên ở đây chỉ chuẩn hóa định dạng cho dễ nhìn.
import { supabase } from './supabaseClient'
import { normalizeText } from './text'
import { normalizePhone } from './validators'
import { buildCsvContent, triggerFileDownload } from './backup'
import { todayISO } from './schedule'

export const MAX_IMPORT_ROWS = 500

// key: tên trường gửi lên Database. aliases: các tên cột chấp nhận (đã bỏ dấu, chữ thường).
const COLUMNS = [
  {
    key: 'student_name',
    label: 'Họ và tên học sinh',
    required: true,
    aliases: ['ho va ten hoc sinh', 'ho ten hoc sinh', 'ten hoc sinh', 'hoc sinh'],
  },
  {
    key: 'student_phone',
    label: 'SĐT học sinh',
    aliases: ['sdt hoc sinh', 'so dien thoai hoc sinh', 'dien thoai hoc sinh'],
  },
  {
    key: 'parent_name',
    label: 'Họ tên phụ huynh',
    aliases: ['ho ten phu huynh', 'ho va ten phu huynh', 'ten phu huynh', 'phu huynh'],
  },
  {
    key: 'parent_phone',
    label: 'SĐT phụ huynh',
    required: true,
    aliases: ['sdt phu huynh', 'so dien thoai phu huynh', 'dien thoai phu huynh'],
  },
  {
    key: 'class_name',
    label: 'Tên lớp',
    required: true,
    aliases: ['ten lop', 'lop', 'lop hoc', 'ten lop hoc'],
  },
  {
    key: 'joined_at',
    label: 'Ngày vào lớp (DD/MM/YYYY)',
    aliases: ['ngay vao lop', 'ngay vao lop (dd/mm/yyyy)', 'ngay vao hoc'],
  },
]

export const TEMPLATE_COLUMN_LABELS = COLUMNS.map((column) => column.label)

// ---- Đọc CSV ----

// Chọn dấu phân cách theo dòng tiêu đề (Excel tiếng Việt thường lưu bằng dấu ; hoặc ,).
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && char in counts) counts[char] += 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

// Tách CSV thành mảng các dòng; hỗ trợ ô trong ngoặc kép, ngoặc kép lồng ("") và xuống dòng trong ô.
export function parseCsvText(rawText) {
  const text = String(rawText ?? '').replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// Bỏ lớp bọc ="0912345678" mà file sao lưu / file mẫu dùng để Excel giữ số 0 đầu.
function stripExcelTextWrapper(value) {
  const match = /^="(.*)"$/.exec(String(value ?? '').trim())
  return match ? match[1] : String(value ?? '').trim()
}

// "27/10/2026", "7/3/2026" hoặc "2026-10-27" -> "2026-10-27". Giá trị lạ được giữ nguyên để Database báo lỗi rõ.
function normalizeDateCell(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return text
}

// Trả về { rows, clientWarnings } hoặc { error } nếu file không dùng được.
export function parseStudentImportText(rawText) {
  const text = String(rawText ?? '')
  if (text.includes('�')) {
    return {
      error:
        'File bị lỗi font chữ tiếng Việt. Trong Excel hãy chọn Lưu thành (Save As) -> "CSV UTF-8 (Comma delimited)" rồi chọn lại file.',
    }
  }

  const table = parseCsvText(text)
  if (table.length === 0) return { error: 'File trống. Hãy dùng file mẫu của Trung tâm.' }

  const headerCells = table[0].map((cell) => normalizeText(cell))
  const columnIndex = {}
  for (const column of COLUMNS) {
    const index = headerCells.findIndex((cell) => column.aliases.includes(cell) || cell === normalizeText(column.label))
    if (index >= 0) columnIndex[column.key] = index
  }
  const missing = COLUMNS.filter((column) => column.required && columnIndex[column.key] === undefined)
  if (missing.length > 0) {
    return {
      error: `Dòng tiêu đề của file thiếu cột: ${missing.map((column) => `"${column.label}"`).join(', ')}. Hãy dùng file mẫu của Trung tâm.`,
    }
  }

  const rows = []
  const clientWarnings = []
  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index]
    if (cells.every((cell) => String(cell).trim() === '')) continue
    const line = index + 1 // số dòng như trong Excel (dòng 1 là tiêu đề)
    const read = (key) => (columnIndex[key] === undefined ? '' : String(cells[columnIndex[key]] ?? '').trim())

    const item = {
      line,
      student_name: read('student_name'),
      student_phone: normalizePhone(stripExcelTextWrapper(read('student_phone'))),
      parent_name: read('parent_name'),
      parent_phone: normalizePhone(stripExcelTextWrapper(read('parent_phone'))),
      class_name: read('class_name'),
      joined_at: normalizeDateCell(read('joined_at')),
    }

    // Excel hay làm mất số 0 đầu của SĐT (912345678): tự thêm lại và báo cho người dùng biết.
    for (const [key, label] of [
      ['student_phone', 'SĐT học sinh'],
      ['parent_phone', 'SĐT phụ huynh'],
    ]) {
      if (/^[1-9]\d{8}$/.test(item[key])) {
        clientWarnings.push({ line, message: `${label} ${item[key]} thiếu số 0 đầu, Trung tâm tự thêm thành 0${item[key]}.` })
        item[key] = `0${item[key]}`
      }
    }
    rows.push(item)
  }

  if (rows.length === 0) return { error: 'File không có dòng học sinh nào (chỉ có dòng tiêu đề).' }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} dòng (file có ${rows.length} dòng). Hãy chia nhỏ file.` }
  }
  return { rows, clientWarnings }
}

// ---- Gọi Database ----

// Gửi lên Database: chạy kiểm tra (dryRun = true) hoặc nhập thật (dryRun = false).
export async function runStudentImport(rows, { dryRun }) {
  const { data, error } = await supabase.rpc('import_students_bulk', {
    p_rows: rows,
    p_dry_run: dryRun,
  })
  if (error) throw error
  return data
}

// ---- File tải về ----

export function downloadImportTemplate() {
  const headers = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    type: column.key.endsWith('phone') ? 'phone' : 'text',
  }))
  triggerFileDownload(buildCsvContent(headers, []), 'sciencehub_mau_nhap_hoc_sinh.csv', 'text/csv;charset=utf-8')
}

// Danh sách tên lớp đang hiển thị để copy đúng tên vào cột "Tên lớp".
export async function downloadClassNameList() {
  const { data, error } = await supabase
    .from('classes')
    .select('name, subject, grade, teachers(full_name)')
    .is('deleted_at', null)
  if (error) throw error

  const rows = [...(data ?? [])]
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'vi'))
    .map((cls) => ({
      name: cls.name,
      subject: cls.subject ?? '',
      grade: cls.grade ?? '',
      teacher: cls.teachers?.full_name ?? '',
    }))
  const headers = [
    { key: 'name', label: 'Tên lớp (copy vào cột "Tên lớp")' },
    { key: 'subject', label: 'Môn học' },
    { key: 'grade', label: 'Khối', type: 'number' },
    { key: 'teacher', label: 'Giáo viên' },
  ]
  triggerFileDownload(buildCsvContent(headers, rows), `sciencehub_danh_sach_lop_${todayISO()}.csv`, 'text/csv;charset=utf-8')
  return rows.length
}
