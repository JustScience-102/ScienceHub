// Bảo mật V3: ghi dữ liệu chỉ qua RPC (kể cả Quản lý), phạm vi đọc của Giáo viên, phiên 48 giờ.
import { assert, expectDenied, expectError } from './lib/assert.mjs'
import { addClass, addTeacher, enrollmentOf, mark, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}

export default {
  name: 'V3: bảo mật & phân quyền',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.lan = await addTeacher(ctx, 'Nguyễn Thị Lan', '0912000001')
    s.hung = await addTeacher(ctx, 'Trần Văn Hùng', '0912000002')
    s.lanClass = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.hungClass = (await addClass(ctx, { teacherId: s.hung, subject: 'Vật Lí', grade: 9 })).id
    s.anh = await register(ctx, { classId: s.lanClass, name: 'Nguyễn Minh Anh', parentPhone: '0901000001' })
    s.ngoc = await register(ctx, { classId: s.hungClass, name: 'Trần Bảo Ngọc', parentPhone: '0901000002' })
    s.eAnh = await enrollmentOf(ctx, s.anh, s.lanClass)
    await mark(ctx, { classId: s.lanClass, date: s.today, items: [{ enrollment_id: s.eAnh, status: 'present' }] })
    s.lanUser = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
  },
  tests: {
    'Quản lý KHÔNG sửa thẳng được price_snapshot (V2 làm được)': async (ctx) => {
      await expectDenied(ctx.manager.query(`update public.attendance_records set price_snapshot = 1`))
    },

    'Quản lý KHÔNG thêm/xóa thẳng được dữ liệu nghiệp vụ': async (ctx) => {
      await expectDenied(ctx.manager.query(`insert into public.teachers (full_name) values ('X')`))
      await expectDenied(ctx.manager.query(`delete from public.students`))
      await expectDenied(ctx.manager.query(`update public.class_enrollments set status = 'active'`))
      await expectDenied(ctx.manager.query(`delete from public.audit_log`))
    },

    'Giáo viên chỉ thấy lớp, học sinh, phụ huynh, điểm danh của mình': async () => {
      const classes = await s.lanUser.query(`select id from public.classes`)
      assert.deepEqual(classes.map((r) => r.id), [s.lanClass])
      const students = await s.lanUser.query(`select id from public.students`)
      assert.deepEqual(students.map((r) => r.id), [s.anh])
      const parents = await s.lanUser.query(`select phone from public.parents`)
      assert.deepEqual(parents.map((r) => r.phone), ['0901000001'])
      const teachers = await s.lanUser.query(`select id from public.teachers`)
      assert.deepEqual(teachers.map((r) => r.id), [s.lan])
      assert.equal((await s.lanUser.query(`select * from public.attendance_records`)).length, 1)
      assert.equal((await s.lanUser.query(`select * from public.audit_log`)).length, 0)
      assert.equal((await s.lanUser.query(`select * from public.profiles`)).length, 1)
    },

    'Giáo viên không gọi được RPC chỉ dành cho Quản lý': async () => {
      await expectError(s.lanUser.rpc('save_teacher', { p_teacher_id: null, p_full_name: 'X', p_phone: null, p_email: null }), 'Chỉ Quản lý')
      await expectError(s.lanUser.rpc('dashboard_schedule', { p_date: s.today }), 'Chỉ Quản lý')
      await expectError(s.lanUser.rpc('close_month', { p_year: 2026, p_month: 1 }), 'Chỉ Quản lý')
    },

    'Giáo viên không điểm danh/sửa lớp của giáo viên khác': async (ctx) => {
      const eNgoc = await enrollmentOf(ctx, s.ngoc, s.hungClass)
      await expectError(
        mark(ctx, { actor: s.lanUser, classId: s.hungClass, date: s.today, items: [{ enrollment_id: eNgoc, status: 'present' }] }),
        'lớp mình phụ trách',
      )
      await expectError(
        addClass(ctx, { actor: s.lanUser, teacherId: s.hung, subject: 'Toán', grade: 9 }),
        'của chính mình',
      )
    },

    'anon không đọc được gì và không gọi được RPC nào': async (ctx) => {
      await expectDenied(ctx.anon.query(`select * from public.students`))
      await expectDenied(ctx.anon.rpc('my_profile'))
      await expectDenied(ctx.anon.rpc('lookup_parent_by_phone', { p_phone: '0901000001' }))
    },

    'Người đăng nhập chưa có vai trò: không thấy dữ liệu, RPC báo cần đăng nhập': async (ctx) => {
      const stranger = await ctx.createUser('la@sciencehub.test')
      assert.equal((await stranger.query(`select * from public.classes`)).length, 0)
      assert.equal((await stranger.rpc('my_profile')).status, 'no_profile')
      await expectError(stranger.rpc('dashboard_summary', { p_year: 2026, p_month: 10 }), 'cần đăng nhập')
    },

    'Phiên Giáo viên quá 48 giờ bị từ chối, khóa tài khoản cũng bị từ chối': async (ctx) => {
      await ctx.sql(`update auth.users set last_sign_in_at = now() - interval '49 hours' where id = $1`, [s.lanUser.uid])
      assert.equal((await s.lanUser.rpc('my_profile')).status, 'expired')
      assert.equal((await s.lanUser.query(`select * from public.classes`)).length, 0)
      await ctx.sql(`update auth.users set last_sign_in_at = now() where id = $1`, [s.lanUser.uid])
      assert.equal((await s.lanUser.query(`select * from public.classes`)).length, 1)

      await ctx.manager.rpc('set_teacher_account_active', { p_teacher_id: s.lan, p_active: false })
      assert.equal((await s.lanUser.rpc('my_profile')).status, 'inactive')
      await expectError(mark(ctx, { actor: s.lanUser, classId: s.lanClass, date: s.today, items: [{ enrollment_id: s.eAnh, status: 'absent' }] }), 'cần đăng nhập')
      await ctx.manager.rpc('set_teacher_account_active', { p_teacher_id: s.lan, p_active: true })
    },

    'Liên kết lại email khác: tài khoản cũ mất quyền': async (ctx) => {
      const newUser = await teacherAccount(ctx, s.lan, 'lan2@sciencehub.test')
      assert.equal((await s.lanUser.rpc('my_profile')).status, 'no_profile')
      assert.equal((await newUser.rpc('my_profile')).status, 'ok')
      await expectError(ctx.manager.rpc('link_teacher_account', { p_email: 'quanly@sciencehub.test', p_teacher_id: s.hung }), 'tài khoản Quản lý')
    },
  },
}
