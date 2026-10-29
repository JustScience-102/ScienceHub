// Khóa sổ theo tháng (supabase/v3/06_rpc_admin.sql): chốt tháng đã qua để không ai thêm/sửa/xóa điểm danh
// của tháng đó; mở lại bắt buộc ghi lý do (vào Nhật ký thay đổi). Không thu tiền, không công nợ.
import { supabase } from './supabaseClient'

// Các tháng đã chốt, mới nhất trước: [{ month_start, closed_at, closed_by_name }]
export async function listClosedMonths() {
  const { data, error } = await supabase
    .from('month_closures')
    .select('month_start, closed_at, closed_by_name')
    .order('month_start', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function closeMonth({ year, month }) {
  const { data, error } = await supabase.rpc('close_month', { p_year: year, p_month: month })
  if (error) throw error
  return data
}

export async function reopenMonth({ year, month }, reason) {
  const { error } = await supabase.rpc('reopen_month', { p_year: year, p_month: month, p_reason: reason })
  if (error) throw error
}

// "2026-10-01" -> { year: 2026, month: 10 }
export function monthFromStart(monthStart) {
  const [year, month] = String(monthStart).split('-').map(Number)
  return { year, month }
}
