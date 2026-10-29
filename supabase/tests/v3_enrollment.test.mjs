// Ghi danh, cho nghỉ, đổi lớp; trạng thái học sinh/phụ huynh tự tính; quy tắc cùng khối; sửa học sinh.
import { assert, expectError } from './lib/assert.mjs'
import { addDays } from './lib/harness.mjs'
import { ALL_DAYS, addClass, addTeacher, enrollmentOf, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const student = (ctx, id) => ctx.one(`select grade, deleted_at is not null as hidden, parent_id from public.students where id = $1`, [id])
const parentHidden = (ctx, id) => ctx.value(`select deleted_at is not null from public.parents where id = $1`, [id])

export default {
  name: 'V3: ghi danh & trạng thái học sinh',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.lan = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.toan9a = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.toan9b = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.li9 = (await addClass(ctx, { teacherId: s.lan, subject: 'Vật Lí', grade: 9 })).id
    s.toan10 = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 10 })).id
    s.lanUser = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
  },
  tests: {
    'Đăng ký học sinh mới: khối tự gán theo lớp, phụ huynh tạo theo SĐT': async (ctx) => {
      s.anh = await register(ctx, { classId: s.toan9a, name: '  Nguyễn   Minh Anh ', parentName: 'Nguyễn Văn Minh', parentPhone: '0901000001', joinedAt: addDays(s.today, -30) })
      const row = await ctx.one(`select full_name, grade from public.students where id = $1`, [s.anh])
      assert.deepEqual(row, { full_name: 'Nguyễn Minh Anh', grade: 9 })
      s.parent = (await student(ctx, s.anh)).parent_id
    },

    'Anh chị em cùng SĐT phụ huynh dùng chung một phụ huynh (không sửa tên)': async (ctx) => {
      s.khoi = await register(ctx, { classId: s.toan10, name: 'Nguyễn Minh Khôi', parentName: 'Tên Khác', parentPhone: '0901000001' })
      assert.equal((await student(ctx, s.khoi)).parent_id, s.parent)
      assert.equal(await ctx.value(`select full_name from public.parents where id = $1`, [s.parent]), 'Nguyễn Văn Minh')
    },

    'SĐT sai định dạng và SĐT học sinh trùng báo lỗi tiếng Việt': async (ctx) => {
      await expectError(register(ctx, { classId: s.toan9a, name: 'X', parentPhone: '123' }), 'SĐT phụ huynh "123" chưa đúng')
      await register(ctx, { classId: s.toan9a, name: 'Y', parentPhone: '0901000009', phone: '0987000001' })
      await expectError(register(ctx, { classId: s.toan9a, name: 'Z', parentPhone: '0901000008', phone: '0987000001' }), 'đã thuộc về một học sinh khác')
    },

    'Chỉ ghi danh vào lớp cùng khối; học thêm môn khác cùng khối được': async (ctx) => {
      await ctx.manager.rpc('enroll_existing_student', { p_class_id: s.li9, p_student_id: s.anh, p_joined_at: addDays(s.today, -30) })
      await expectError(
        ctx.manager.rpc('enroll_existing_student', { p_class_id: s.toan10, p_student_id: s.anh, p_joined_at: s.today }),
        'cùng khối',
      )
      await expectError(
        ctx.manager.rpc('enroll_existing_student', { p_class_id: s.li9, p_student_id: s.anh, p_joined_at: s.today }),
        'đang học lớp',
      )
    },

    'Đổi lớp: ghi left_reason = transferred và liên kết ghi danh mới': async (ctx) => {
      const old = await enrollmentOf(ctx, s.anh, s.toan9a)
      await ctx.manager.rpc('transfer_enrollment', { p_enrollment_id: old, p_new_class_id: s.toan9b, p_date: addDays(s.today, -5), p_delete_attendance: false })
      const row = await ctx.one(`select status, left_reason, transfer_to_id, left_at::text as left_at from public.class_enrollments where id = $1`, [old])
      const next = await enrollmentOf(ctx, s.anh, s.toan9b)
      assert.deepEqual(row, { status: 'dropped', left_reason: 'transferred', transfer_to_id: next, left_at: addDays(s.today, -5) })
      assert.equal((await student(ctx, s.anh)).hidden, false)
    },

    'Ghi danh đã kết thúc không mở lại được, không sửa được ngày vào lớp': async (ctx) => {
      const old = await ctx.value(`select id from public.class_enrollments where student_id = $1 and status = 'dropped'`, [s.anh])
      await expectError(ctx.sql(`update public.class_enrollments set status = 'active', left_at = null, left_reason = null, transfer_to_id = null where id = $1`, [old]), 'đã kết thúc')
      const cur = await enrollmentOf(ctx, s.anh, s.toan9b)
      await expectError(ctx.sql(`update public.class_enrollments set joined_at = joined_at - 1 where id = $1`, [cur]), 'ngày vào lớp')
    },

    'Nghỉ hết lớp: học sinh tự ẩn; phụ huynh còn con khác nên vẫn hiện': async (ctx) => {
      for (const cls of [s.toan9b, s.li9]) {
        await ctx.manager.rpc('drop_enrollment', { p_enrollment_id: await enrollmentOf(ctx, s.anh, cls), p_left_at: s.today, p_delete_attendance: false })
      }
      const st = await student(ctx, s.anh)
      assert.equal(st.hidden, true)
      assert.equal(st.grade, 9)
      assert.equal(await parentHidden(ctx, s.parent), false)
    },

    'Con còn lại nghỉ: phụ huynh tự ẩn; ghi danh lại thì cả hai tự hiện': async (ctx) => {
      await ctx.manager.rpc('drop_enrollment', { p_enrollment_id: await enrollmentOf(ctx, s.khoi, s.toan10), p_left_at: s.today, p_delete_attendance: false })
      assert.equal(await parentHidden(ctx, s.parent), true)
      await ctx.manager.rpc('enroll_existing_student', { p_class_id: s.toan10, p_student_id: s.anh, p_joined_at: s.today })
      const st = await student(ctx, s.anh)
      assert.deepEqual([st.hidden, st.grade], [false, 10])
      assert.equal(await parentHidden(ctx, s.parent), false)
    },

    'Đổi khối một lớp khi học sinh còn học lớp khối khác: bị chặn lúc commit (kiểm tra hoãn)': async (ctx) => {
      s.mai = await register(ctx, { classId: s.toan9a, name: 'Phạm Mai', parentPhone: '0901000003' })
      await ctx.manager.rpc('enroll_existing_student', { p_class_id: s.li9, p_student_id: s.mai, p_joined_at: s.today })
      await expectError(ctx.manager.rpc('save_class', {
        p_class_id: s.li9, p_subject: 'Vật Lí', p_grade: 10, p_class_no: null, p_teacher_id: s.lan, p_price: 100000, p_schedule: ALL_DAYS,
      }), 'khác khối')
      assert.equal(await ctx.value(`select grade from public.classes where id = $1`, [s.li9]), 9)
      assert.equal((await student(ctx, s.mai)).grade, 9)
    },

    'Đổi khối lớp hợp lệ: khối của học sinh tự cập nhật': async (ctx) => {
      const lop = (await addClass(ctx, { teacherId: s.lan, subject: 'Anh', grade: 6 })).id
      const em = await register(ctx, { classId: lop, name: 'Em Sáu', parentPhone: '0901000004' })
      await ctx.manager.rpc('save_class', {
        p_class_id: lop, p_subject: 'Anh', p_grade: 7, p_class_no: null, p_teacher_id: s.lan, p_price: 100000, p_schedule: ALL_DAYS,
      })
      assert.equal((await student(ctx, em)).grade, 7)
    },

    'Giáo viên: ghi danh chỉ lớp mình và trong tháng hiện tại; đổi lớp chỉ cùng môn cùng khối': async (ctx) => {
      await expectError(
        register(ctx, { actor: s.lanUser, classId: s.toan9a, name: 'Q', parentPhone: '0901000005', joinedAt: addDays(`${s.today.slice(0, 7)}-01`, -1) }),
        'tháng hiện tại',
      )
      const q = await register(ctx, { actor: s.lanUser, classId: s.toan9a, name: 'Q', parentPhone: '0901000005' })
      await expectError(s.lanUser.rpc('transfer_enrollment', {
        p_enrollment_id: await enrollmentOf(ctx, q, s.toan9a), p_new_class_id: s.li9, p_date: s.today, p_delete_attendance: false,
      }), 'cùng khối và cùng môn')
    },

    'Sửa học sinh: Giáo viên đổi sang SĐT mới khi phụ huynh chỉ có 1 con thì chỉ đổi SĐT (giữ tên)': async (ctx) => {
      const p = (await student(ctx, s.mai)).parent_id
      const oldName = await ctx.value(`select full_name from public.parents where id = $1`, [p])
      await s.lanUser.rpc('update_student', { p_student_id: s.mai, p_full_name: 'Phạm Thị Mai', p_phone: null, p_parent_name: 'Tên Mới', p_parent_phone: '0901000099' })
      assert.deepEqual(await ctx.one(`select full_name, phone from public.parents where id = $1`, [p]), { full_name: oldName, phone: '0901000099' })
    },

    'Tra cứu SĐT phụ huynh chỉ khớp đúng 10 số': async () => {
      assert.equal(await s.lanUser.rpc('lookup_parent_by_phone', { p_phone: '090100009' }), null)
      const r = await s.lanUser.rpc('lookup_parent_by_phone', { p_phone: '0901000099' })
      assert.equal(r.students.length, 1)
    },

    'Thống kê Tổng quan: học sinh đang học và nghỉ hẳn trong tháng': async (ctx) => {
      const [y, m] = s.today.split('-').map(Number)
      const sum = await ctx.manager.rpc('dashboard_summary', { p_year: y, p_month: m })
      const active = await ctx.value(`select count(distinct student_id)::int from public.class_enrollments where status = 'active'`)
      assert.equal(sum.student_count, active)
      assert.equal(sum.graduated_students, 0)
      assert.ok(sum.dropped_students >= 1)
    },
  },
}
