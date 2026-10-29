// Khôi phục dữ liệu từ file sao lưu .json (do export_center_backup xuất ra): 10_v2_7_restore_backup.sql.
// Luồng: đọc file -> tải từng phần lên bảng tạm (restore_stage_chunk) -> xem trước (dry-run) -> khôi phục.
// Nhật ký thay đổi và tài khoản Quản lý không bị thay; nhật ký trong file không được nạp lại.
import { supabase } from './supabaseClient'

export const RESTORE_CONFIRM_TEXT = 'KHOI PHUC'
export const CENTER_NAME = 'Trung tâm ScienceHub'

// Thứ tự tải lên; bảng bắt buộc phải có trong file.
const STAGE_ORDER = [
  'teachers',
  'parents',
  'students',
  'classes',
  'class_schedules',
  'class_enrollments',
  'attendance_records',
  'class_versions',
  'profiles',
]
const REQUIRED_TABLES = STAGE_ORDER.slice(0, 7)
const CHUNK_SIZE = 500

export const TABLE_LABELS = {
  teachers: 'Giáo viên',
  parents: 'Phụ huynh',
  students: 'Học sinh',
  classes: 'Lớp học',
  class_schedules: 'Lịch học',
  class_enrollments: 'Ghi danh',
  attendance_records: 'Điểm danh',
  class_versions: 'Lịch sử nhãn lớp',
  profiles: 'Tài khoản giáo viên',
}

// Hàm thuần: đọc nội dung file, kiểm tra hình dạng. Trả { backup } hoặc { error } (tiếng Việt).
export function parseBackupText(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'File không phải JSON hợp lệ. Hãy chọn đúng file sao lưu (.json) do Trung tâm xuất.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.metadata || !data.tables) {
    return { error: 'File này không có cấu trúc của bản sao lưu Trung tâm (thiếu metadata hoặc tables).' }
  }
  if (data.metadata.center !== CENTER_NAME) {
    return { error: 'File này không phải bản sao lưu của Trung tâm ScienceHub.' }
  }
  for (const name of REQUIRED_TABLES) {
    if (!Array.isArray(data.tables[name])) {
      return { error: `File sao lưu thiếu dữ liệu bảng "${TABLE_LABELS[name]}". Có thể file bị hỏng hoặc bị cắt.` }
    }
  }
  const declared = data.metadata.counts ?? {}
  for (const name of STAGE_ORDER) {
    if (Array.isArray(data.tables[name]) && Number.isInteger(declared[name]) && declared[name] !== data.tables[name].length) {
      return {
        error: `File sao lưu có thể bị cắt hoặc hỏng: bảng "${TABLE_LABELS[name]}" khai báo ${declared[name]} dòng nhưng chỉ có ${data.tables[name].length} dòng.`,
      }
    }
  }
  return { backup: data }
}

// Hàm thuần: số dòng từng bảng trong file (đếm thực tế, không tin phần khai báo).
export function summarizeBackup(backup) {
  const counts = {}
  for (const name of STAGE_ORDER) {
    if (Array.isArray(backup.tables[name])) counts[name] = backup.tables[name].length
  }
  return {
    exportedAt: backup.metadata.exported_at ?? null,
    version: backup.metadata.version ?? '',
    hasClassVersions: Array.isArray(backup.tables.class_versions),
    hasProfiles: Array.isArray(backup.tables.profiles),
    counts,
  }
}

// Hàm thuần: cắt mảng thành các phần (luôn có ít nhất 1 phần, kể cả mảng rỗng).
export function chunkRows(rows, size = CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks.length > 0 ? chunks : [[]]
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

// Tải toàn bộ file lên bảng tạm theo từng phần. onProgress({ done, total }).
async function stageBackup(backup, runId, onProgress) {
  const plan = []
  for (const name of STAGE_ORDER) {
    if (!Array.isArray(backup.tables[name])) continue
    chunkRows(backup.tables[name]).forEach((rows, index) => plan.push({ name, index, rows }))
  }
  const total = plan.length + 1
  let done = 0
  const stagedCounts = {}
  for (const name of STAGE_ORDER) {
    if (Array.isArray(backup.tables[name])) stagedCounts[name] = backup.tables[name].length
  }
  for (const part of plan) {
    await rpc('restore_stage_chunk', { p_run_id: runId, p_table: part.name, p_chunk: part.index, p_rows: part.rows })
    done += 1
    onProgress?.({ done, total })
  }
  await rpc('restore_stage_chunk', {
    p_run_id: runId,
    p_table: '_metadata',
    p_chunk: 0,
    p_rows: {
      center: backup.metadata.center,
      version: backup.metadata.version ?? null,
      exported_at: backup.metadata.exported_at ?? null,
      file_counts: backup.metadata.counts ?? {},
      staged_counts: stagedCounts,
    },
  })
  onProgress?.({ done: total, total })
}

// Tải file lên và chạy xem trước. Trả { runId, result }.
export async function previewRestore(backup, onProgress) {
  const runId = crypto.randomUUID()
  try {
    await stageBackup(backup, runId, onProgress)
    const result = await rpc('restore_center_backup', { p_run_id: runId, p_dry_run: true, p_confirm_text: null })
    return { runId, result }
  } catch (error) {
    await abortRestore(runId)
    throw error
  }
}

export function applyRestore(runId, confirmText) {
  return rpc('restore_center_backup', { p_run_id: runId, p_dry_run: false, p_confirm_text: confirmText })
}

// Hủy lần tải dở (không báo lỗi nếu thất bại: bảng tạm tự dọn sau 1 ngày).
export async function abortRestore(runId) {
  if (!runId) return
  try {
    await supabase.rpc('restore_stage_abort', { p_run_id: runId })
  } catch {
    // bỏ qua
  }
}
