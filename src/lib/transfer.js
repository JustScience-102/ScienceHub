// Hỗ trợ "Đổi lớp" và "Đăng ký thêm lớp" trong Hồ sơ học sinh.
// Quy tắc cùng khối cũng được Database chặn cứng (trigger check_enrollment_grade);
// phần kiểm tra ở đây chỉ để khóa sẵn lựa chọn sai và nói rõ lý do.

import { supabase } from './supabaseClient'
import { toVietnameseError } from './errors'
import { classGrade } from './grade'

const PAGE_SIZE = 1000

// Báo lỗi đổi lớp. Thiếu hàm transfer_enrollment thì chỉ rõ file cần chạy;
// lỗi khác dùng errors.js.
export function transferError(error) {
  if (!error) return ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  const missingFunction =
    error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(text)
  if (missingFunction && /transfer_enrollment/.test(text)) {
    return 'Database chưa được cập nhật đầy đủ. Hãy chạy lần lượt 01_schema.sql, 02_triggers.sql và 03_rpc_and_auth.sql trong Supabase SQL Editor.'
  }
  return toVietnameseError(error)
}

// Tải mọi lớp chưa ẩn kèm giáo viên, lịch và sĩ số (số ghi danh 'active').
// Ghi danh được tải theo trang vì Supabase chỉ trả tối đa 1000 dòng mỗi lần.
// Trả về { classes, counts } hoặc { error }.
export async function loadClassChoices() {
  const classResult = await supabase
    .from('classes')
    .select(
      'id, name, subject, grade, price_per_session, teachers(full_name), class_schedules(day_of_week, start_time, end_time)',
    )
    .is('deleted_at', null)
  if (classResult.error) return { error: transferError(classResult.error) }

  const counts = {}
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('status', 'active')
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { error: transferError(error) }
    for (const row of data) counts[row.class_id] = (counts[row.class_id] ?? 0) + 1
    if (data.length < PAGE_SIZE) break
  }
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
