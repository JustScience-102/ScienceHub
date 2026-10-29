// Điểm danh, đơn giá đóng băng, học bù (liên kết buổi gốc, mỗi buổi bù 1 lần, hủy bù) và khóa sổ tháng.
import { assert, expectError } from './lib/assert.mjs'
import { addDays } from './lib/harness.mjs'
import { addClass, addTeacher, enrollmentOf, lastMonthDay, mark, record, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const setPrice = (ctx, classId, teacherId, price) =>
  ctx.manager.rpc('save_class', {
    p_class_id: classId, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: teacherId,
    p_price: price, p_schedule: [2, 3, 4, 5, 6, 7, 8].map((day) => ({ day, start: '17:30', end: '19:00' })),
  })

export default {
  name: 'V3: điểm danh, học bù, khóa sổ',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.prev = lastMonthDay(s.today)
    s.prev2 = lastMonthDay(s.today, 1)
    s.joined = addDays(s.today, -45)
    s.teacher = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.a = (await addClass(ctx, { teacherId: s.teacher, price: 100000 })).id
    s.b = (await addClass(ctx, { teacherId: s.teacher, price: 200000 })).id
    s.st = await register(ctx, { classId: s.a, name: 'Học Sinh A', parentPhone: '0901000001', joinedAt: s.joined })
    s.enr = await enrollmentOf(ctx, s.st, s.a)
    s.lan = await teacherAccount(ctx, s.teacher, 'lan@sciencehub.test')
  },
  tests: {
    'save_attendance trả về dòng đã lưu với giá thật': async (ctx) => {
      const rows = await mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'present' }] })
      assert.equal(rows.length, 1)
      assert.equal(rows[0].price_snapshot, 100000)
    },

    'Đổi giá lớp rồi Có mặt -> Vắng: giữ giá đóng băng; Có phép -> Có mặt: lấy giá mới': async (ctx) => {
      await setPrice(ctx, s.a, s.teacher, 150000)
      await mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'absent' }] })
      assert.equal((await record(ctx, s.a, s.st, s.prev)).price_snapshot, 100000)
      await mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'absent_excused' }] })
      await mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'present' }] })
      assert.equal((await record(ctx, s.a, s.st, s.prev)).price_snapshot, 150000)
    },

    'Ngay cả chủ Database cũng không sửa được giá đã đóng băng (trigger chặn)': async (ctx) => {
      await expectError(
        ctx.sql(`update public.attendance_records set price_snapshot = 1 where class_id = $1`, [s.a]),
        'không cho sửa đơn giá đã đóng băng',
      )
    },

    'Học bù: buổi gốc thành Có phép, buổi bù mang giá đóng băng của buổi gốc': async (ctx) => {
      // Buổi gốc s.prev2 đang Vắng (tính tiền 150.000đ); bù ở lớp B (giá 200.000đ) ngày s.prev
      await mark(ctx, { classId: s.a, date: s.prev2, items: [{ enrollment_id: s.enr, status: 'absent' }] })
      const r = await ctx.manager.rpc('record_makeup', {
        p_makeup_class_id: s.b, p_date: s.prev, p_enrollment_id: s.enr, p_original_date: s.prev2,
      })
      assert.equal(r.price, 150000)
      assert.deepEqual(await record(ctx, s.a, s.st, s.prev2), {
        status: 'absent_excused', price_snapshot: null, makeup_of_date: null, makeup_prev_status: null, makeup_prev_price: null,
      })
      assert.deepEqual(await record(ctx, s.b, s.st, s.prev), {
        status: 'present', price_snapshot: 150000, makeup_of_date: s.prev2, makeup_prev_status: 'absent', makeup_prev_price: 150000,
      })
      s.makeupId = r.makeup_id
    },

    'Một buổi gốc KHÔNG được bù lần 2 (V2 cho bù 2 lần)': async (ctx) => {
      await expectError(ctx.manager.rpc('record_makeup', {
        p_makeup_class_id: s.b, p_date: s.today, p_enrollment_id: s.enr, p_original_date: s.prev2,
      }), 'Mỗi buổi chỉ được bù một lần')
    },

    'Không sửa/xóa buổi bù và buổi gốc đã được bù bằng điểm danh thường': async (ctx) => {
      await expectError(mark(ctx, { classId: s.b, date: s.prev, items: [{ enrollment_id: s.enr, status: null }] }), 'Hủy học bù')
      await expectError(mark(ctx, { classId: s.a, date: s.prev2, items: [{ enrollment_id: s.enr, status: 'present' }] }), 'đã được học bù')
    },

    'Hủy học bù: buổi gốc trở lại Vắng với đúng giá cũ': async (ctx) => {
      await ctx.manager.rpc('cancel_makeup', { p_record_id: s.makeupId })
      assert.equal(await record(ctx, s.b, s.st, s.prev), undefined)
      assert.deepEqual(await record(ctx, s.a, s.st, s.prev2), {
        status: 'absent', price_snapshot: 150000, makeup_of_date: null, makeup_prev_status: null, makeup_prev_price: null,
      })
    },

    'Bù cho buổi chưa điểm danh rồi hủy: buổi gốc do bù tạo ra được xóa': async (ctx) => {
      const orig = addDays(s.prev2, -1)
      const r = await ctx.manager.rpc('record_makeup', {
        p_makeup_class_id: s.b, p_date: orig, p_enrollment_id: s.enr, p_original_date: orig,
      })
      assert.equal(r.price, 150000)
      assert.equal((await record(ctx, s.a, s.st, orig)).status, 'absent_excused')
      await ctx.manager.rpc('cancel_makeup', { p_record_id: r.makeup_id })
      assert.equal(await record(ctx, s.a, s.st, orig), undefined)
    },

    'Giáo viên điểm danh và học bù trong tháng hiện tại; tháng trước bị khóa': async (ctx) => {
      const rows = await mark(ctx, { actor: s.lan, classId: s.a, date: s.today, items: [{ enrollment_id: s.enr, status: 'present' }] })
      assert.equal(rows[0].price_snapshot, 150000)
      await expectError(
        mark(ctx, { actor: s.lan, classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'absent' }] }),
        'Giáo viên chỉ được điểm danh trong tháng hiện tại',
      )
      const r = await s.lan.rpc('record_makeup', { p_makeup_class_id: s.b, p_date: s.today, p_enrollment_id: s.enr, p_original_date: addDays(s.today, 0) })
        .catch((e) => e)
      // Buổi gốc hôm nay đã Có mặt => không bù được
      assert.match(String(r.message), /Có mặt/)
    },

    'Chốt sổ tháng trước: không ai thêm/sửa/xóa điểm danh tháng đó': async (ctx) => {
      await expectError(ctx.manager.rpc('close_month', { p_year: Number(s.today.slice(0, 4)), p_month: Number(s.today.slice(5, 7)) }), 'tháng đã qua')
      const [y, m] = s.prev.split('-').map(Number)
      const closed = await ctx.manager.rpc('close_month', { p_year: y, p_month: m })
      assert.ok(closed.revenue > 0)
      await expectError(mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'absent' }] }), 'đã chốt sổ')
      await expectError(mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: null }] }), 'đã chốt sổ')
      await expectError(ctx.manager.rpc('record_makeup', {
        p_makeup_class_id: s.b, p_date: s.today, p_enrollment_id: s.enr, p_original_date: s.prev2,
      }), 'đã chốt sổ')
      await expectError(ctx.manager.rpc('close_month', { p_year: y, p_month: m }), 'đã được chốt sổ')
      assert.equal((await ctx.manager.rpc('dashboard_summary', { p_year: y, p_month: m })).month_closed, true)
    },

    'Cho nghỉ có xóa điểm danh của tháng đã chốt cũng bị chặn': async (ctx) => {
      await expectError(ctx.manager.rpc('drop_enrollment', {
        p_enrollment_id: s.enr, p_left_at: addDays(s.prev, -3), p_delete_attendance: true,
      }), 'đã chốt sổ')
      assert.equal(await ctx.value(`select status from public.class_enrollments where id = $1`, [s.enr]), 'active')
    },

    'Mở lại sổ phải có lý do; sau đó sửa được': async (ctx) => {
      const [y, m] = s.prev.split('-').map(Number)
      await expectError(ctx.manager.rpc('reopen_month', { p_year: y, p_month: m, p_reason: ' ' }), 'lý do')
      await ctx.manager.rpc('reopen_month', { p_year: y, p_month: m, p_reason: 'Sửa điểm danh nhầm của em A' })
      await mark(ctx, { classId: s.a, date: s.prev, items: [{ enrollment_id: s.enr, status: 'absent' }] })
    },

    'Không điểm danh Có mặt cho ngày tương lai; Có phép thì được': async (ctx) => {
      const future = addDays(s.today, 1)
      await expectError(mark(ctx, { classId: s.a, date: future, items: [{ enrollment_id: s.enr, status: 'present' }] }), 'tương lai')
      await mark(ctx, { classId: s.a, date: future, items: [{ enrollment_id: s.enr, status: 'absent_excused' }] })
    },

    'Cho nghỉ có xóa điểm danh: buổi học bù bị xóa thì buổi gốc được trả lại': async (ctx) => {
      const orig = addDays(s.today, -2)
      const makeupDay = addDays(s.today, -1)
      await mark(ctx, { classId: s.a, date: orig, items: [{ enrollment_id: s.enr, status: 'absent' }] })
      await ctx.manager.rpc('record_makeup', { p_makeup_class_id: s.b, p_date: makeupDay, p_enrollment_id: s.enr, p_original_date: orig })
      assert.equal((await record(ctx, s.a, s.st, orig)).status, 'absent_excused')
      // Nghỉ từ ngày buổi gốc: buổi bù (sau ngày nghỉ) bị xóa, buổi gốc trở lại Vắng tính tiền
      await ctx.manager.rpc('drop_enrollment', { p_enrollment_id: s.enr, p_left_at: orig, p_delete_attendance: true })
      assert.equal(await record(ctx, s.b, s.st, makeupDay), undefined)
      assert.equal((await record(ctx, s.a, s.st, orig)).status, 'absent')
      assert.equal(await ctx.value(`select left_reason from public.class_enrollments where id = $1`, [s.enr]), 'dropped')
      assert.equal(await ctx.value(`select deleted_at is not null from public.students where id = $1`, [s.st]), true)
    },
  },
}
