// Lịch học theo thời kỳ: đổi lịch "áp dụng từ ngày", điểm danh ngày nào kiểm theo lịch hiệu lực ngày đó.
import { assert, expectError } from './lib/assert.mjs'
import { addDays } from './lib/harness.mjs'
import { addClass, addTeacher, enrollmentOf, mark, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const dow = (iso) => {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return day === 0 ? 8 : day + 1
}

export default {
  name: 'V3: lịch học theo thời kỳ',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.d20 = addDays(s.today, -20)
    s.dayA = dow(s.d20)
    s.dayB = s.dayA === 8 ? 2 : s.dayA + 1
    s.teacher = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.cls = (await addClass(ctx, {
      teacherId: s.teacher, schedule: [{ day: s.dayA, start: '17:30', end: '19:00' }],
    })).id
    s.st = await register(ctx, { classId: s.cls, name: 'Học Sinh A', parentPhone: '0901000001', joinedAt: addDays(s.today, -30) })
    s.enr = await enrollmentOf(ctx, s.st, s.cls)
  },
  tests: {
    'Lịch ban đầu áp dụng từ đầu: điểm danh được ngày 20 hôm trước (đúng thứ)': async (ctx) => {
      await mark(ctx, { classId: s.cls, date: s.d20, items: [{ enrollment_id: s.enr, status: 'present' }] })
    },

    'Đổi lịch từ ngày 10 hôm trước: thời kỳ cũ đóng ở ngày trước đó': async (ctx) => {
      s.from = addDays(s.today, -10)
      const r = await ctx.manager.rpc('save_class', {
        p_class_id: s.cls, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: s.teacher, p_price: 100000,
        p_schedule: [{ day: s.dayB, start: '18:00', end: '19:30' }], p_schedule_from: s.from,
      })
      assert.equal(r.schedule_changed, true)
      const rows = await ctx.sql(`select day_of_week, valid_from::text as f, valid_to::text as t from public.class_schedules where class_id = $1 order by valid_from nulls first`, [s.cls])
      assert.deepEqual(rows, [
        { day_of_week: s.dayA, f: null, t: addDays(s.from, -1) },
        { day_of_week: s.dayB, f: s.from, t: null },
      ])
    },

    'Ngày theo lịch cũ TRƯỚC ngày đổi vẫn thêm được điểm danh (V2 không làm được)': async (ctx) => {
      const old = addDays(s.d20, 7)
      if (old < s.from) {
        await mark(ctx, { classId: s.cls, date: old, items: [{ enrollment_id: s.enr, status: 'absent' }] })
      }
      assert.equal(await ctx.value(`select public.class_has_session($1, $2)`, [s.cls, s.d20]), true)
    },

    'Ngày theo lịch cũ SAU ngày đổi bị từ chối; ngày theo lịch mới được nhận': async (ctx) => {
      let oldDay = s.from
      while (dow(oldDay) !== s.dayA) oldDay = addDays(oldDay, 1)
      if (oldDay <= s.today) {
        await expectError(
          mark(ctx, { classId: s.cls, date: oldDay, items: [{ enrollment_id: s.enr, status: 'present' }] }),
          'không nằm trong lịch học',
        )
      }
      let newDay = s.from
      while (dow(newDay) !== s.dayB) newDay = addDays(newDay, 1)
      await mark(ctx, { classId: s.cls, date: newDay, items: [{ enrollment_id: s.enr, status: 'present' }] })
    },

    'Áp dụng lịch sớm hơn ngày bắt đầu của lịch hiện tại bị từ chối': async (ctx) => {
      await expectError(ctx.manager.rpc('save_class', {
        p_class_id: s.cls, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: s.teacher, p_price: 100000,
        p_schedule: [{ day: s.dayA, start: '18:00', end: '19:30' }], p_schedule_from: addDays(s.from, -1),
      }), 'lịch mới phải áp dụng từ ngày đó trở đi')
    },

    'Sửa lại lịch cùng ngày bắt đầu: thay hẳn, không sinh thời kỳ rỗng': async (ctx) => {
      await ctx.manager.rpc('save_class', {
        p_class_id: s.cls, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: s.teacher, p_price: 100000,
        p_schedule: [{ day: s.dayB, start: '18:15', end: '19:45' }], p_schedule_from: s.from,
      })
      const n = await ctx.value(`select count(*)::int from public.class_schedules where class_id = $1`, [s.cls])
      assert.equal(n, 2)
    },

    'Sửa lớp mà lịch không đổi: không tạo thời kỳ mới': async (ctx) => {
      const r = await ctx.manager.rpc('save_class', {
        p_class_id: s.cls, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: s.teacher, p_price: 120000,
        p_schedule: [{ day: s.dayB, start: '18:15', end: '19:45' }], p_schedule_from: s.today,
      })
      assert.equal(r.schedule_changed, false)
    },

    'Giáo viên chỉ áp dụng lịch mới từ trong tháng hiện tại': async (ctx) => {
      const lan = await teacherAccount(ctx, s.teacher, 'lan@sciencehub.test')
      await expectError(lan.rpc('save_class', {
        p_class_id: s.cls, p_subject: 'Toán', p_grade: 9, p_class_no: null, p_teacher_id: s.teacher, p_price: 120000,
        p_schedule: [{ day: s.dayA, start: '18:15', end: '19:45' }],
        p_schedule_from: addDays(`${s.today.slice(0, 7)}-01`, -1),
      }), 'tháng hiện tại')
    },

    'Lịch trong ngày của Tổng quan dùng lịch hiệu lực của ngày đó': async (ctx) => {
      const old = await ctx.manager.rpc('dashboard_schedule', { p_date: s.d20 })
      assert.equal(old.length, 1)
      assert.equal(old[0].start_time, '17:30:00')
      let oldDay = s.from
      while (dow(oldDay) !== s.dayA) oldDay = addDays(oldDay, 1)
      const after = await ctx.manager.rpc('dashboard_schedule', { p_date: oldDay })
      assert.equal(after.length, 0)
    },
  },
}
