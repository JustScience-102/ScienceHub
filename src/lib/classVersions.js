// Lịch sử nhãn lớp (tên, môn, khối, STT, giáo viên) theo thời kỳ: bảng class_versions của 09_v2_6_year_rollover.sql.
// Mỗi dòng là một thời kỳ ĐÃ ĐÓNG [valid_from, valid_to] (ngày YYYY-MM-DD). Ngày không nằm trong dòng nào
// thì lớp dùng nhãn hiện tại. Điểm danh, giá đóng băng và học phí không phụ thuộc bảng này.
import { supabase } from './supabaseClient'

// Tải các thời kỳ của những lớp được liệt kê (RLS: Quản lý thấy tất cả, Giáo viên chỉ lớp của mình).
export async function fetchClassVersions(classIds) {
  const ids = [...new Set((classIds ?? []).filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('class_versions')
    .select('class_id, name, subject, grade, class_no, teacher_name, valid_from, valid_to')
    .in('class_id', ids)
  if (error) throw error
  return data ?? []
}

// Thời kỳ chứa ngày dateISO của lớp classId, hoặc null nếu dùng nhãn hiện tại.
export function pickClassVersion(versions, classId, dateISO) {
  if (!dateISO) return null
  let hit = null
  for (const version of versions ?? []) {
    if (version.class_id !== classId) continue
    if (version.valid_from <= dateISO && dateISO <= version.valid_to) {
      if (!hit || version.valid_to > hit.valid_to) hit = version
    }
  }
  return hit
}

// Bản sao của cls mang nhãn đúng tại ngày dateISO (không có thời kỳ phù hợp thì trả nguyên cls).
export function labelClassOn(cls, classId, versions, dateISO) {
  if (!cls) return cls
  const version = pickClassVersion(versions, classId, dateISO)
  if (!version) return cls
  return {
    ...cls,
    name: version.name,
    subject: version.subject,
    grade: version.grade,
    class_no: version.class_no,
    teachers: version.teacher_name ? { ...cls.teachers, full_name: version.teacher_name } : cls.teachers,
  }
}
