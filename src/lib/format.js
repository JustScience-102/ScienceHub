// Định dạng tiền VNĐ có dấu chấm phân cách: 100000 -> "100.000đ"
export function formatCurrency(value) {
  const amount = Number(value) || 0
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'
}

// Định dạng ngày DD/MM/YYYY. Nhận "YYYY-MM-DD", chuỗi ISO hoặc đối tượng Date.
export function formatDate(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match && value.length === 10) {
      return `${match[3]}/${match[2]}/${match[1]}`
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}
