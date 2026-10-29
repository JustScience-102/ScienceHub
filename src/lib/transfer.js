// Hỗ trợ "Đổi lớp" và "Đăng ký thêm lớp" trong Hồ sơ học sinh.
// Quy tắc cùng khối cũng được Database chặn cứng (trigger check_enrollment_grade);
// phần kiểm tra ở đây chỉ để khóa sẵn lựa chọn sai và nói rõ lý do.

import { supabase } from './supabaseClient'
import { toVietnameseError } from './errors'
import { fetchAll } from './fetchAll'
import { classGrade } from './grade'

// Báo lỗi đổi lớp (dùng errors.js).
export function transferError(error) {
  return toVietnameseError(error)
}

// Tải mọi lớp chưa ẩn kèm giáo viên, lịch và sĩ số (số ghi danh 'active').
// Tải theo trang vì Supabase chỉ trả tối đa 1000 dòng mỗi lần.
// Trả về { classes, counts } hoặc { error }.
export async function loadClassChoices() {
  const [classResult, enrollResult] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('classes')
        .select(
          'id, name, subject, grade, price_per_session, teachers(full_name), class_schedules(day_of_week, start_time, end_time, valid_from, valid_to)',
        )
        .is('deleted_at', null),
    ),
    fetchAll(() => supabase.from('class_enrollments').select('id, class_id').eq('status', 'active')),
  ])
  if (classResult.error) return { error: transferError(classResult.error) }
  if (enrollResult.error) return { error: transferError(enrollResult.error) }

  const counts = {}
  for (const row of enrollResult.data) counts[row.class_id] = (counts[row.class_id] ?? 0) + 1
  return { classes: classResult.data, counts }
}

// Khối mà học sinh đang học: lấy từ các lớp 'active' có khối rõ ràng (Database đảm bảo cùng một khối).
export function studentGradeOf(activeEnrollments) {
  for (const enrollment of activeEnrollments) {
    const grade = classGrade(enrollment.classes)
    if (grade) return grade
  }
  return null
}

// Danh sách lớp để chọn:
//  - bỏ lớp học sinh đang học (hoặc lớp bị loại trừ, ví dụ lớp đang rời đi);
//  - lớp khác khối của học sinh thì giữ lại nhưng khóa, kèm lý do;
//  - lớp chưa có khối (lớp mock cũ) thì cho chọn, giống Database.
// Sắp theo tên lớp.
export function buildClassChoices({ classes, activeEnrollments, excludeClassIds = [] }) {
  const hidden = new Set([...excludeClassIds, ...activeEnrollments.map((row) => row.class_id)])
  const grade = studentGradeOf(activeEnrollments)

  const list = classes
    .filter((cls) => !hidden.has(cls.id))
    .map((cls) => {
      const clsGrade = classGrade(cls)
      const blockReason =
        grade && clsGrade && clsGrade !== grade
          ? `Lớp khối ${clsGrade}, học sinh đang học khối ${grade}. Trung tâm chỉ xếp học sinh vào các lớp cùng khối.`
          : ''
      return { cls, blockReason }
    })
    .sort((a, b) => String(a.cls.name ?? '').localeCompare(String(b.cls.name ?? ''), 'vi'))

  return { list, grade }
}
