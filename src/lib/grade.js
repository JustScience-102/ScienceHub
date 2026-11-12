// Khối lớp và bộ lọc Khối / Môn dùng chung cho trang Lớp học và Học sinh.

// Giá trị đặc biệt của ô lọc: mục chưa có khối / chưa có môn.
export const NONE = '__none__'

// Khối của một lớp: cột grade (1..12). Dữ liệu thiếu hoặc không hợp lệ thì null.
export function classGrade(cls) {
  const grade = Number(cls?.grade)
  return Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null
}

// Gom các giá trị khác nhau thành danh sách cho ô lọc. Mục không có giá trị xếp cuối
// dưới nhãn "Chưa phân loại".
export function buildOptions(values, { numeric = false } = {}) {
  const present = new Set()
  let hasNone = false
  for (const value of values) {
    if (value === null || value === undefined || value === '') hasNone = true
    else present.add(value)
  }
  const list = [...present].sort((a, b) =>
    numeric ? Number(a) - Number(b) : String(a).localeCompare(String(b), 'vi'),
  )
  return { list, hasNone }
}
