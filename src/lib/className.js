// Quy tắc đặt tên lớp: Môn_Khối_TênGV_STT
// Ví dụ: Toan_9_Thiep_1, VatLi_12_Nam_2

import { normalizeText } from './text'

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : ''
}

// "Vật Lí" -> "VatLi", "Khoa học tự nhiên" -> "KhoaHocTuNhien"
export function subjectToken(subject) {
  return normalizeText(subject).split(/\s+/).filter(Boolean).map(capitalize).join('')
}

// Tên gọi = từ cuối của họ tên: "Nguyễn Thị Lan" -> "Lan"
export function teacherToken(fullName) {
  const lastWord = String(fullName ?? '').trim().split(/\s+/).pop()
  return capitalize(normalizeText(lastWord))
}

// Phần đầu tên lớp (chưa có STT): "Toan_9_Lan". Trả về '' nếu thiếu thông tin.
export function classNamePrefix({ subject, grade, teacherName }) {
  const subjectPart = subjectToken(subject)
  const teacherPart = teacherToken(teacherName)
  if (!subjectPart || !grade || !teacherPart) return ''
  return `${subjectPart}_${grade}_${teacherPart}`
}

export function buildClassName(parts, classNo) {
  const prefix = classNamePrefix(parts)
  return prefix && classNo ? `${prefix}_${classNo}` : ''
}

// Tên lớp mới khi đổi giáo viên (hoặc khôi phục lớp). Môn, khối, lịch, giá không đổi.
//   - Lớp có đủ môn + khối: ghép lại tên theo giáo viên mới. Giữ STT cũ nếu còn trống,
//     không thì lấy số kế tiếp còn trống.
//   - Lớp cũ chưa có môn/khối (4 lớp mock): giữ nguyên tên, người dùng bấm Sửa để đặt lại.
export function planTeacherChange({ cls, teacherName, takenNames }) {
  const keep = { name: cls.name, classNo: cls.class_no ?? null, renamed: false }
  if (!cls.subject || !cls.grade) return keep

  const prefix = classNamePrefix({ subject: cls.subject, grade: cls.grade, teacherName })
  if (!prefix) return keep

  const taken = new Set(takenNames.map((name) => String(name).toLowerCase()))
  let classNo = cls.class_no
  if (!classNo || taken.has(`${prefix}_${classNo}`.toLowerCase())) {
    classNo = suggestClassNo(prefix, takenNames)
  }
  const name = `${prefix}_${classNo}`
  return { name, classNo, renamed: name !== cls.name }
}

// STT nhỏ nhất chưa bị lớp nào đang hiển thị dùng cho cùng phần đầu tên.
export function suggestClassNo(prefix, takenNames) {
  if (!prefix) return 1
  const taken = new Set(takenNames.map((name) => String(name).toLowerCase()))
  let number = 1
  while (taken.has(`${prefix}_${number}`.toLowerCase())) number += 1
  return number
}
