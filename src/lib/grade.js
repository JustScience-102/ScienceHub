// Khối lớp và bộ lọc Khối / Môn dùng chung cho trang Lớp học và Học sinh.

// Giá trị đặc biệt của ô lọc: mục chưa có khối / chưa có môn.
export const NONE = '__none__'

// Khối của một lớp: cột grade, nếu trống thì lấy số cuối của tên lớp ("Toán 9" -> 9).
// Giống hàm class_effective_grade ở Database; chỉ phục vụ các lớp mock cũ chưa được sửa.
export function classGrade(cls) {
  if (!cls) return null
  if (cls.grade) return Number(cls.grade)
  const match = /\s(\d{1,2})$/.exec(String(cls.name ?? ''))
  const value = match ? Number(match[1]) : 0
  return value >= 1 && value <= 12 ? value : null
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
