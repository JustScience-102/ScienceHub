// Tải file sao lưu lên bảng tạm theo từng phần rồi gọi restore_center_backup, giống src/lib/restore.js.
import { randomUUID } from 'node:crypto'

const STAGE_ORDER = [
  'teachers', 'parents', 'students', 'classes', 'class_schedules', 'class_enrollments',
  'attendance_records', 'class_versions', 'month_closures', 'profiles',
]

export async function stageBackup(ctx, backup, chunkSize = 500) {
  const runId = randomUUID()
  const stagedCounts = {}
  for (const name of STAGE_ORDER) {
    const rows = backup.tables[name]
    if (!Array.isArray(rows)) continue
    stagedCounts[name] = rows.length
    const chunks = []
    for (let i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize))
    if (chunks.length === 0) chunks.push([])
    for (const [index, part] of chunks.entries()) {
      await ctx.manager.rpc('restore_stage_chunk', { p_run_id: runId, p_table: name, p_chunk: index, p_rows: part })
    }
  }
  await ctx.manager.rpc('restore_stage_chunk', {
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
  return runId
}

export function previewRestore(ctx, runId) {
  return ctx.manager.rpc('restore_center_backup', { p_run_id: runId, p_dry_run: true, p_confirm_text: null })
}

export function applyRestore(ctx, runId, confirm = 'KHOI PHUC') {
  return ctx.manager.rpc('restore_center_backup', { p_run_id: runId, p_dry_run: false, p_confirm_text: confirm })
}
