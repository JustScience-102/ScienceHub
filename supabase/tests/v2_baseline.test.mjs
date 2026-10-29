// Bộ test nền: chạy chuỗi V2 (supabase/legacy 01 -> 10) và ghi nhận hành vi hiện tại, kể cả các kẽ hở
// mà V3 phải sửa. Các test "[Kẽ hở V2]" khẳng định lỗi CÓ xảy ra trên V2 (để so sánh với V3).
import { assert, expectError } from './lib/assert.mjs'
import { addDays } from './lib/harness.mjs'
import { buildV2Dataset, exportV2Backup } from './lib/v2_dataset.mjs'

let data

export default {
  name: 'Nền V2 (chuỗi legacy)',
  base: 'v2',
  async setup(ctx) {
    data = await buildV2Dataset(ctx)
  },
  tests: {
    'Chuỗi 01 -> 10 cài được, đủ 7 policy Giáo viên và 11 trigger nhật ký': async (ctx) => {
      assert.equal(
        await ctx.value(`select count(*)::int from pg_policies where schemaname = 'public' and policyname like 'v2_teacher_%'`),
        7,
      )
      assert.equal(
        await ctx.value(`select count(*)::int from pg_trigger where tgname like 'trg_audit_%' and not tgisinternal`),
        11,
      )
    },

    'Dữ liệu mẫu: giá đóng băng, học bù, đổi lớp, tự ẩn học sinh': async (ctx) => {
      const prices = await ctx.sql(
        `select distinct price_snapshot from public.attendance_records where class_id = $1 and status <> 'absent_excused'`,
        [data.classes.toan9],
      )
      assert.deepEqual(prices.map((row) => row.price_snapshot), [150000])
      const makeup = await ctx.one(
        `select status, price_snapshot from public.attendance_records where class_id = $1`,
        [data.classes.toan9b],
      )
      assert.deepEqual(makeup, { status: 'present', price_snapshot: 150000 })
      assert.equal(
        await ctx.value(`select deleted_at is not null from public.students where id = $1`, [data.students.ngoc]),
        true,
      )
      assert.equal(
        await ctx.value(`select count(*)::int from public.audit_log where action = 'enrollment_transfer'`),
        1,
      )
    },

    'Giáo viên chỉ thấy lớp của mình': async () => {
      const rows = await data.users.lan.query(`select name from public.classes order by name`)
      assert.deepEqual(rows.map((row) => row.name), ['Toan_9_Lan_1', 'Toan_9_Lan_2'])
    },

    '[Kẽ hở V2] Một buổi gốc được học bù 2 lần, tính tiền 2 lần': async (ctx) => {
      await ctx.manager.rpc('record_makeup', {
        p_makeup_class_id: data.classes.toan9b,
        p_date: addDays(data.today, -11),
        p_enrollment_id: data.enrollments.eHuy,
        p_original_date: addDays(data.today, -13),
      })
      const charged = await ctx.value(
        `select count(*)::int from public.attendance_records
         where enrollment_id = $1 and class_id = $2 and status = 'present'`,
        [data.enrollments.eHuy, data.classes.toan9b],
      )
      assert.equal(charged, 2)
    },

    '[Kẽ hở V2] Quản lý sửa thẳng price_snapshot qua API được': async (ctx) => {
      await ctx.manager.query(
        `update public.attendance_records set price_snapshot = 1 where enrollment_id = $1`,
        [data.enrollments.eAnh],
      )
      assert.equal(
        await ctx.value(`select min(price_snapshot) from public.attendance_records where enrollment_id = $1`, [
          data.enrollments.eAnh,
        ]),
        1,
      )
    },

    '[Kẽ hở V2] Tên lớp do trình duyệt gửi lên được lưu nguyên văn': async (ctx) => {
      const id = await ctx.manager.rpc('save_class', {
        p_class_id: null, p_name: 'Ten tuy y', p_subject: 'Toán', p_grade: 9, p_class_no: 7,
        p_teacher_id: data.teachers.lan, p_price: 1, p_schedule: [{ day: 2, start: '08:00', end: '09:00' }],
        p_restore: false,
      })
      assert.equal(await ctx.value(`select name from public.classes where id = $1`, [id]), 'Ten tuy y')
    },

    'anon không đọc được dữ liệu và không gọi được RPC': async (ctx) => {
      const rows = await ctx.anon.query(`select * from public.students`).catch(() => [])
      assert.equal(rows.length, 0)
      await expectError(ctx.anon.rpc('dashboard_summary', { p_year: 2026, p_month: 10 }), /permission denied/)
    },

    'Xuất sao lưu V2 đủ bảng': async (ctx) => {
      const backup = await exportV2Backup(ctx)
      assert.equal(backup.metadata.center, 'Trung tâm ScienceHub')
      for (const table of ['parents', 'teachers', 'students', 'classes', 'class_schedules',
        'class_enrollments', 'attendance_records', 'profiles', 'class_versions', 'audit_log']) {
        assert.ok(Array.isArray(backup.tables[table]), `thiếu bảng ${table}`)
      }
      assert.equal(backup.tables.students.length, 4)
      assert.ok(backup.tables.profiles.some((row) => row.email === 'lan@sciencehub.test'))
    },
  },
}
