// Nối app giao bài ScienceHub (10_sciencehub.sql): lịch sử làm bài tập trong hồ sơ học sinh, phân quyền đọc,
// schema "sciencehub" không mở cho giao diện (chỉ tài khoản sciencehub_link của app giao bài dùng).
import { assert, expectDenied, expectError } from './lib/assert.mjs'
import { addClass, addTeacher, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}

const history = (actor, studentId) => actor.query('select * from public.student_homework_history($1)', [studentId])

export default {
  name: 'V3: nối app giao bài ScienceHub',
  base: 'v3',
  async setup(ctx) {
    s.nam = await addTeacher(ctx, 'Nguyễn Văn Nam', '0912000011')
    s.lan = await addTeacher(ctx, 'Trần Thị Lan', '0912000012')
    s.namClass = (await addClass(ctx, { teacherId: s.nam, subject: 'Vật Lí', grade: 12 })).id
    s.lanClass = (await addClass(ctx, { teacherId: s.lan, subject: 'Hóa học', grade: 12 })).id
    s.an = await register(ctx, { classId: s.namClass, name: 'Lê Văn An', parentName: 'Lê Văn Hùng', parentPhone: '0901000011', phone: '0987000011' })
    s.binh = await register(ctx, { classId: s.lanClass, name: 'Phạm Thị Bình', parentPhone: '0901000012' })
    s.anCode = await ctx.value('select student_code from public.students where id = $1', [s.an])
    // App giao bài ghi điểm bằng tài khoản riêng; ở đây ghi thẳng bằng quyền chủ Database.
    await ctx.sql(
      `insert into sciencehub.results (assignment_id, student_code, title, subject, kind, score10, attempts, last_submitted_at) values
         ('a1', $1, 'Bài tại lớp – Nhiệt dung riêng', 'Vật Lí', 'class', 8.5, 1, '2026-11-10T10:00:00Z')`,
      [s.anCode],
    )
    await ctx.sql(
      `insert into sciencehub.results (assignment_id, student_code, title, subject, kind, floors_total, floors_passed, floors, attempts, last_submitted_at) values
         ('a2', $1, 'Tháp – Từ trường', 'Vật Lí', 'tower', 3, 2,
          '[{"floor":1,"score10":9,"passed":true,"attempts":1},{"floor":2,"score10":8,"passed":true,"attempts":2},{"floor":3,"score10":5,"passed":false,"attempts":1}]',
          4, '2026-11-15T10:00:00Z')`,
      [s.anCode],
    )
    s.namUser = await teacherAccount(ctx, s.nam, 'nam@sciencehub.test')
    s.lanUser = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
  },
  tests: {
    'Quản lý xem lịch sử làm bài tập của học sinh, bài mới nộp trước': async (ctx) => {
      const rows = await history(ctx.manager, s.an)
      assert.deepEqual(rows.map((r) => r.title), ['Tháp – Từ trường', 'Bài tại lớp – Nhiệt dung riêng'])
      assert.equal(Number(rows[1].score10), 8.5)
      assert.equal(rows[0].floors_passed, 2)
      assert.equal(rows[0].floors.length, 3)
    },

    'Học sinh chưa làm bài nào: danh sách trống': async (ctx) => {
      assert.deepEqual(await history(ctx.manager, s.binh), [])
    },

    'Giáo viên xem được học sinh lớp mình, không xem được học sinh lớp khác': async () => {
      assert.equal((await history(s.namUser, s.an)).length, 2)
      await expectError(history(s.lanUser, s.an), 'lớp mình phụ trách')
    },

    'Người chưa đăng nhập / chưa có vai trò không xem được': async (ctx) => {
      await expectDenied(history(ctx.anon, s.an))
      const stranger = await ctx.createUser('la@sciencehub.test')
      await expectError(history(stranger, s.an), 'cần đăng nhập')
    },

    'Giao diện không đọc thẳng được schema sciencehub (bảng điểm, danh sách đồng bộ)': async (ctx) => {
      await expectDenied(ctx.manager.query('select * from sciencehub.results'))
      await expectDenied(ctx.manager.query('select sciencehub.roster()'))
      await expectDenied(ctx.anon.query('select sciencehub.roster()'))
    },

    'roster() trả mã HS, họ tên, khối, lớp, ghi danh, SĐT phụ huynh – không có tên phụ huynh, SĐT học sinh': async (ctx) => {
      const r = await ctx.value('select sciencehub.roster()')
      const an = r.students.find((x) => x.code === s.anCode)
      assert.deepEqual(Object.keys(an).sort(), ['code', 'grade', 'left', 'name', 'phone'])
      assert.equal(an.phone, '0901000011', 'SĐT phụ huynh làm mật khẩu ban đầu bên app giao bài')
      assert.equal(an.left, false)
      assert.ok(r.classes.some((c) => c.id === s.namClass && c.subject === 'Vật Lí'))
      assert.ok(r.enrollments.some((e) => e.code === s.anCode && e.class_id === s.namClass))
      assert.ok(!JSON.stringify(r).includes('0987000011'), 'không lộ SĐT học sinh')
      assert.ok(!JSON.stringify(r).includes('Lê Văn Hùng'), 'không lộ tên phụ huynh')
    },

    'Chạy lại 10_sciencehub.sql rồi 09_grants.sql: vẫn đúng, giữ điểm': async (ctx) => {
      const { readSql } = await import('./lib/harness.mjs')
      await ctx.exec(readSql('supabase/v3/10_sciencehub.sql'))
      await ctx.exec(readSql('supabase/v3/09_grants.sql'))
      assert.equal((await history(s.namUser, s.an)).length, 2)
      assert.equal(await ctx.value(`select has_function_privilege('anon', 'public.student_homework_history(uuid)', 'execute')`), false)
    },
  },
}
