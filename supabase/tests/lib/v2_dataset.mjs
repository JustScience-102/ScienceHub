// Dựng một bộ dữ liệu mẫu trên Database V2 (chuỗi supabase/legacy) bằng đúng các RPC V2 mà giao diện
// cũ đang gọi, rồi xuất file sao lưu. Dùng cho test nền V2 và test chuyển dữ liệu V2 -> V3.
import { addDays } from './harness.mjs'

export const ALL_DAYS = [2, 3, 4, 5, 6, 7, 8].map((day) => ({ day, start: '17:30', end: '19:00' }))

export async function buildV2Dataset(ctx) {
  const m = ctx.manager
  const today = await ctx.today()
  const d = (offset) => addDays(today, offset)

  // Giáo viên: giao diện V2 ghi thẳng bảng teachers.
  const [lan] = await m.query(
    `insert into public.teachers (full_name, phone, email) values ('Nguyễn Thị Lan', '0912000001', 'lan@sciencehub.test') returning id`,
  )
  const [hung] = await m.query(
    `insert into public.teachers (full_name, phone) values ('Trần Văn Hùng', '0912000002') returning id`,
  )

  const saveClass = (name, subject, grade, teacherId, price) =>
    m.rpc('save_class', {
      p_class_id: null,
      p_name: name,
      p_subject: subject,
      p_grade: grade,
      p_class_no: 1,
      p_teacher_id: teacherId,
      p_price: price,
      p_schedule: ALL_DAYS,
      p_restore: false,
    })

  const toan9 = await saveClass('Toan_9_Lan_1', 'Toán', 9, lan.id, 150000)
  const toan9b = await m.rpc('save_class', {
    p_class_id: null, p_name: 'Toan_9_Lan_2', p_subject: 'Toán', p_grade: 9, p_class_no: 2,
    p_teacher_id: lan.id, p_price: 140000, p_schedule: ALL_DAYS, p_restore: false,
  })
  const li9 = await saveClass('VatLi_9_Hung_1', 'Vật Lí', 9, hung.id, 120000)
  const li12 = await saveClass('VatLi_12_Hung_1', 'Vật Lí', 12, hung.id, 130000)

  const register = (classId, name, parentName, parentPhone, joined) =>
    m.rpc('register_student_in_class', {
      p_class_id: classId,
      p_joined_at: joined,
      p_full_name: name,
      p_phone: null,
      p_parent_name: parentName,
      p_parent_phone: parentPhone,
    })

  const anh = await register(toan9, 'Nguyễn Minh Anh', 'Nguyễn Văn Minh', '0901000001', d(-20))
  const khoi = await register(toan9, 'Nguyễn Minh Khôi', 'Nguyễn Văn Minh', '0901000001', d(-20))
  const ngoc = await register(li12, 'Trần Bảo Ngọc', 'Trần Thị Hoa', '0901000002', d(-20))
  const huy = await register(toan9, 'Lê Gia Huy', 'Lê Quốc Dũng', '0901000003', d(-20))

  const enrollmentOf = async (studentId, classId) =>
    ctx.value(
      `select id from public.class_enrollments where student_id = $1 and class_id = $2 and status = 'active'`,
      [studentId, classId],
    )

  // Anh học thêm Vật Lí 9 (cùng khối)
  await m.rpc('enroll_existing_student', { p_class_id: li9, p_student_id: anh, p_joined_at: d(-20) })

  const eAnh = await enrollmentOf(anh, toan9)
  const eKhoi = await enrollmentOf(khoi, toan9)
  const eHuy = await enrollmentOf(huy, toan9)
  const eNgoc = await enrollmentOf(ngoc, li12)
  const eAnhLi = await enrollmentOf(anh, li9)

  for (const offset of [-15, -14, -13]) {
    await m.rpc('save_attendance', {
      p_class_id: toan9,
      p_date: d(offset),
      p_items: [
        { enrollment_id: eAnh, status: 'present' },
        { enrollment_id: eKhoi, status: offset === -14 ? 'absent' : 'present' },
        { enrollment_id: eHuy, status: offset === -13 ? 'absent_excused' : 'present' },
      ],
    })
    await m.rpc('save_attendance', {
      p_class_id: li12,
      p_date: d(offset),
      p_items: [{ enrollment_id: eNgoc, status: 'present' }],
    })
    await m.rpc('save_attendance', {
      p_class_id: li9,
      p_date: d(offset),
      p_items: [{ enrollment_id: eAnhLi, status: 'present' }],
    })
  }

  // Học bù: Huy nghỉ buổi d(-13) ở Toan_9_Lan_1, học bù ở Toan_9_Lan_2 ngày d(-12)
  await m.rpc('record_makeup', {
    p_makeup_class_id: toan9b,
    p_date: d(-12),
    p_enrollment_id: eHuy,
    p_original_date: d(-13),
  })

  // Đổi giá lớp sau khi đã điểm danh: giá cũ đã đóng băng không đổi
  await m.rpc('save_class', {
    p_class_id: toan9, p_name: 'Toan_9_Lan_1', p_subject: 'Toán', p_grade: 9, p_class_no: 1,
    p_teacher_id: lan.id, p_price: 160000, p_schedule: ALL_DAYS, p_restore: false,
  })

  // Đổi lớp: Khôi chuyển sang Toan_9_Lan_2 từ d(-10)
  await m.rpc('transfer_enrollment', {
    p_enrollment_id: eKhoi, p_new_class_id: toan9b, p_date: d(-10), p_delete_attendance: false,
  })
  // Cho nghỉ: Ngọc nghỉ Vật Lí 12 từ d(-5) => học sinh và phụ huynh tự ẩn
  await m.rpc('drop_enrollment', { p_enrollment_id: eNgoc, p_left_at: d(-5), p_delete_attendance: false })

  // Tài khoản giáo viên
  const lanUser = await ctx.createUser('lan@sciencehub.test')
  await m.rpc('link_teacher_account', { p_email: 'lan@sciencehub.test', p_teacher_id: lan.id })

  return {
    today,
    teachers: { lan: lan.id, hung: hung.id },
    classes: { toan9, toan9b, li9, li12 },
    students: { anh, khoi, ngoc, huy },
    enrollments: { eAnh, eKhoi, eHuy, eNgoc, eAnhLi },
    users: { lan: lanUser },
  }
}

export async function exportV2Backup(ctx) {
  return ctx.manager.rpc('export_center_backup', { p_include_audit_log: true, p_tables: null })
}
