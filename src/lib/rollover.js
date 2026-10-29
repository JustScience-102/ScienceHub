// Chuyển năm học: gọi RPC rollover_school_year của 09_v2_6_year_rollover.sql.
// Lớp cuối cấp (5, 9, 12) được đóng, các lớp còn lại lên 1 khối. Xem trước (dry-run) chạy thật rồi hoàn tác.
import { supabase } from './supabaseClient'

export const ROLLOVER_CONFIRM_TEXT = 'CHUYEN NAM HOC'
export const CLOSING_GRADES = [5, 9, 12]

async function callRollover(date, dryRun, confirmText) {
  const { data, error } = await supabase.rpc('rollover_school_year', {
    p_date: date,
    p_dry_run: dryRun,
    p_confirm_text: confirmText || null,
  })
  if (error) throw error
  return data
}

export function previewRollover(date) {
  return callRollover(date, true, null)
}

export function runRollover(date, confirmText) {
  return callRollover(date, false, confirmText)
}
