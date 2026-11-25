// Trang giới thiệu sciencehub.id.vn (11_website.sql): website.catalog() cho trang "Lớp học & học phí",
// tài khoản website_link chỉ gọi được hàm của schema "website", không đọc được bảng nào của schema public.
import { assert, expectDenied } from './lib/assert.mjs'
import { addDays, readSql } from './lib/harness.mjs'
import { addClass, addTeacher, register } from './lib/v3_helpers.mjs'

const s = {}
const SUBJECTS = ['Vật Lí', 'Hóa học']

// Một giao dịch bằng tài khoản website_link (giống hàm máy chủ của trang giới thiệu).
async function asLink(ctx, text, params = []) {
  await ctx.db.exec('begin')
  try {
    await ctx.db.exec('set local role website_link')
    const { rows } = await ctx.db.query(text, params)
    await ctx.db.exec('commit')
    return rows
  } catch (error) {
    await ctx.db.exec('rollback')
    throw error
  }
}
const catalog = async (ctx, subjects = SUBJECTS) =>
  (await asLink(ctx, 'select website.catalog($1::text[]) as data', [subjects]))[0].data
const byId = (data, id) => data.classes.find((c) => c.id === id)

export default {
  name: 'V3: trang giới thiệu (website.catalog, tài khoản website_link)',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    // Trên Supabase người dùng chạy website_link.sql trước 11_website.sql; ở đây tạo vai trò rồi chạy lại file 11.
    await ctx.exec('create role website_link nologin noinherit')
    await ctx.exec(readSql('supabase/v3/11_website.sql'))
    await ctx.exec(readSql('supabase/v3/09_grants.sql'))

    s.nam = await addTeacher(ctx, 'Nguyễn Hải Nam', '0912000021')
    s.lan = await addTeacher(ctx, 'Trần Thị Lan', '0912000022')
    const one = (day, start, end) => [{ day, start, end }]
    // Vật Lí 12: phần 1 = lớp 1 (Thứ 2), lớp 2 (Thứ 5); phần 2 = lớp 3 (Thứ 3), lớp 4 (Thứ 6).
    s.li = []
    const days = [2, 5, 3, 6]
    for (let i = 0; i < 4; i += 1) {
      s.li.push((await addClass(ctx, { teacherId: s.nam, subject: 'Vật Lí', grade: 12, schedule: one(days[i], '18:00', '20:00') })).id)
    }
    await ctx.manager.rpc('save_class_group', { p_group_id: null, p_name: 'Vật Lí 12', p_parts: [[s.li[0], s.li[1]], [s.li[2], s.li[3]]] })
    // Hóa học 11 (không thuộc nhóm), 2 buổi/tuần.
    s.hoa = (await addClass(ctx, {
      teacherId: s.lan, subject: 'Hóa học', grade: 11,
      schedule: [{ day: 4, start: '17:30', end: '19:30' }, { day: 7, start: '08:00', end: '10:00' }],
    })).id
    // Lớp Toán (môn khác) và một lớp Vật Lí đã ẩn: không hiện.
    s.toan = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.hidden = (await addClass(ctx, { teacherId: s.nam, subject: 'Vật Lí', grade: 10 })).id
    await ctx.manager.rpc('set_class_hidden', { p_class_id: s.hidden, p_hidden: true })
    // Học sinh có ghi danh: thông tin của em không được lộ ra web.
    await register(ctx, { classId: s.li[0], name: 'Lê Văn An', parentName: 'Lê Văn Hùng', parentPhone: '0901000021', phone: '0987000021' })
  },
  tests: {
    'Chỉ lớp đang hiển thị của môn được chọn, kèm giáo viên, lịch, nhóm lớp và phần': async (ctx) => {
      const data = await catalog(ctx)
      assert.equal(data.today, s.today)
      const ids = data.classes.map((c) => c.id).sort()
      assert.deepEqual(ids, [...s.li, s.hoa].sort(), 'không có lớp Toán, không có lớp đã ẩn')
      const li1 = byId(data, s.li[0])
      assert.equal(li1.subject, 'Vật Lí')
      assert.equal(li1.grade, 12)
      assert.equal(li1.teacher, 'Nguyễn Hải Nam')
      assert.equal(li1.group.name, 'Vật Lí 12')
      assert.equal(li1.group.part, 1)
      assert.equal(byId(data, s.li[3]).group.part, 2)
      assert.deepEqual(li1.schedules.map((x) => [x.day, x.start, x.end]), [[2, '18:00', '20:00']])
      const hoa = byId(data, s.hoa)
      assert.equal(hoa.group, null)
      assert.deepEqual(hoa.schedules.map((x) => x.day), [4, 7])
      assert.equal(hoa.schedules[1].start, '08:00')
    },

    'Không lộ học sinh, phụ huynh, đơn giá': async (ctx) => {
      const text = JSON.stringify(await catalog(ctx, null))
      for (const secret of ['Lê Văn An', 'Lê Văn Hùng', '0901000021', '0987000021', 'price', '100000']) {
        assert.ok(!text.includes(secret), `không được có "${secret}"`)
      }
      assert.deepEqual(
        Object.keys(byId(await catalog(ctx), s.hoa)).sort(),
        ['class_no', 'grade', 'group', 'id', 'schedules', 'subject', 'teacher'],
      )
    },

    'Không truyền môn thì lấy mọi môn; so tên môn không phân biệt hoa thường': async (ctx) => {
      assert.ok(byId(await catalog(ctx, null), s.toan))
      assert.ok(byId(await catalog(ctx, ['vật lí']), s.li[0]))
      assert.equal(byId(await catalog(ctx, ['vật lí']), s.hoa), undefined)
    },

    'Đổi lịch từ ngày sau: có cả lịch hiện hành và lịch sắp áp dụng; lịch đã hết hạn không hiện': async (ctx) => {
      const from = addDays(s.today, 7)
      await ctx.manager.rpc('save_class', {
        p_class_id: s.hoa, p_subject: 'Hóa học', p_grade: 11, p_class_no: null, p_teacher_id: s.lan, p_price: 100000,
        p_schedule: [{ day: 6, start: '18:00', end: '20:00' }], p_schedule_from: from,
      })
      const rows = byId(await catalog(ctx), s.hoa).schedules
      const current = rows.filter((x) => x.from === null || x.from <= s.today)
      const upcoming = rows.filter((x) => x.from !== null && x.from > s.today)
      assert.deepEqual(current.map((x) => x.day), [4, 7])
      assert.ok(current.every((x) => x.to === addDays(from, -1)))
      assert.deepEqual(upcoming.map((x) => [x.day, x.from]), [[6, from]])
    },

    'website_link không đọc được bảng nào, không gọi được RPC của giao diện': async (ctx) => {
      for (const table of ['students', 'parents', 'classes', 'class_schedules', 'teachers', 'attendance_records']) {
        await expectDenied(asLink(ctx, `select * from public.${table} limit 1`))
      }
      await expectDenied(asLink(ctx, 'select public.dashboard_summary(2026, 11)'))
      await expectDenied(asLink(ctx, 'select * from sciencehub.results'))
    },

    'Giao diện (anon, Quản lý) không gọi được schema website': async (ctx) => {
      await expectDenied(ctx.anon.query('select website.catalog(null)'))
      await expectDenied(ctx.manager.query('select website.catalog(null)'))
    },

    'Chạy lại 11_website.sql rồi 09_grants.sql: vẫn đúng, giữ quyền': async (ctx) => {
      await ctx.exec(readSql('supabase/v3/11_website.sql'))
      await ctx.exec(readSql('supabase/v3/09_grants.sql'))
      assert.equal((await catalog(ctx)).classes.length, 5)
      assert.equal(await ctx.value(`select has_function_privilege('anon', 'website.catalog(text[])', 'execute')`), false)
    },
  },
}
