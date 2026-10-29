// Hàm phụ dựng dữ liệu trên Database V3 bằng đúng các RPC mà giao diện V3 gọi.
import { addDays } from './harness.mjs'

export const ALL_DAYS = [2, 3, 4, 5, 6, 7, 8].map((day) => ({ day, start: '17:30', end: '19:00' }))

export async function addTeacher(ctx, fullName, phone = null) {
  return ctx.manager.rpc('save_teacher', { p_teacher_id: null, p_full_name: fullName, p_phone: phone, p_email: null })
}

// Tạo tài khoản đăng nhập cho giáo viên và trả về actor của giáo viên đó.
export async function teacherAccount(ctx, teacherId, email) {
  const actor = await ctx.createUser(email)
  await ctx.manager.rpc('link_teacher_account', { p_email: email, p_teacher_id: teacherId })
  return actor
}

export async function addClass(ctx, { actor, subject = 'Toán', grade = 9, teacherId, classNo = null, price = 100000, schedule = ALL_DAYS }) {
  return (actor ?? ctx.manager).rpc('save_class', {
    p_class_id: null,
    p_subject: subject,
    p_grade: grade,
    p_class_no: classNo,
    p_teacher_id: teacherId,
    p_price: price,
    p_schedule: schedule,
  })
}

export async function register(ctx, { actor, classId, name, parentName = 'Phụ huynh', parentPhone, joinedAt, phone = null }) {
  return (actor ?? ctx.manager).rpc('register_student_in_class', {
    p_class_id: classId,
    p_joined_at: joinedAt ?? (await ctx.today()),
    p_full_name: name,
    p_phone: phone,
    p_parent_name: parentName,
    p_parent_phone: parentPhone,
  })
}

export async function enrollmentOf(ctx, studentId, classId) {
  return ctx.value(
    `select id from public.class_enrollments where student_id = $1 and class_id = $2 order by created_at desc limit 1`,
    [studentId, classId],
  )
}

export async function mark(ctx, { actor, classId, date, items }) {
  return (actor ?? ctx.manager).rpc('save_attendance', { p_class_id: classId, p_date: date, p_items: items })
}

export async function record(ctx, classId, studentId, date) {
  return ctx.one(
    `select status, price_snapshot, makeup_of_date, makeup_prev_status, makeup_prev_price
     from public.attendance_records where class_id = $1 and student_id = $2 and attendance_date = $3`,
    [classId, studentId, date],
  )
}

// Ngày trong tháng trước (ngày cuối tháng trước - offset).
export function lastMonthDay(today, offset = 0) {
  return addDays(`${today.slice(0, 7)}-01`, -1 - offset)
}
