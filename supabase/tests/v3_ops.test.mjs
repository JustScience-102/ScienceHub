// Vận hành V3: nhập CSV, chuyển năm học (tốt nghiệp, lên khối, tên lớp tự đổi), nhật ký, báo cáo tháng.
import { assert, expectError } from './lib/assert.mjs'
import { addDays } from './lib/harness.mjs'
import { addClass, addTeacher, enrollmentOf, lastMonthDay, mark, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const row = (line, studentName, parentPhone, className, extra = {}) => ({
  line, student_name: studentName, student_phone: '', parent_name: '', parent_phone: parentPhone,
  class_name: className, joined_at: '', ...extra,
})

export default {
  name: 'V3: nhập CSV, chuyển năm học, nhật ký',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.prev = lastMonthDay(s.today)
    s.lan = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.c9 = await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })
    s.c8 = await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 8 })
    s.li8 = await addClass(ctx, { teacherId: s.lan, subject: 'Vật Lí', grade: 8 })
    // Lớp mở từ đầu năm học (để chuyển năm học sinh thời kỳ nhãn cũ như thực tế).
    await ctx.sql(`update public.classes set created_at = now() - interval '90 days'`)
  },
  tests: {
    'Nhập CSV có dòng lỗi: báo lỗi theo dòng, không ghi gì, không tiêu mã': async (ctx) => {
      const r = await ctx.manager.rpc('import_students_bulk', {
        p_rows: [row(2, 'Em A', '0901000001', 'Toan_9_Lan_1'), row(3, 'Em B', '12345', 'Toan_9_Lan_1'), row(4, 'Em C', '0901000003', 'Khong_Co')],
        p_dry_run: false,
      })
      assert.equal(r.applied, false)
      assert.deepEqual(r.errors.map((e) => e.line), [3, 4])
      assert.deepEqual(r.missing_classes, ['Khong_Co'])
      assert.equal(await ctx.value(`select count(*)::int from public.students`), 0)
    },

    'Nhập CSV hợp lệ: học sinh 2 lớp cùng khối, phụ huynh tên tạm; nhập lại thì bỏ qua': async (ctx) => {
      const rows = [
        row(2, 'Em A', '0901000001', 'Toan_8_Lan_1', { parent_name: 'Mẹ A', joined_at: addDays(s.today, -40) }),
        row(3, 'Em A', '0901000001', 'VatLi_8_Lan_1', { joined_at: addDays(s.today, -40) }),
        row(4, 'Em B', '0901000002', 'toan_9_lan_1', { joined_at: addDays(s.today, -40) }),
        row(5, 'Em C', '0901000003', 'Toan_9_Lan_1', { joined_at: addDays(s.today, -40) }),
      ]
      const preview = await ctx.manager.rpc('import_students_bulk', { p_rows: rows, p_dry_run: true })
      assert.deepEqual(preview.summary, { new_parents: 3, new_students: 3, existing_students: 0, enrollments: 4, skipped: 0 })
      assert.equal(await ctx.value(`select count(*)::int from public.students`), 0)
      const r = await ctx.manager.rpc('import_students_bulk', { p_rows: rows, p_dry_run: false })
      assert.equal(r.applied, true)
      assert.equal(await ctx.value(`select full_name from public.parents where phone = '0901000002'`), '(Chưa cập nhật tên)')
      assert.equal(await ctx.value(`select string_agg(student_code, ',' order by student_code) from public.students`), 'HS0001,HS0002,HS0003')
      const again = await ctx.manager.rpc('import_students_bulk', { p_rows: rows, p_dry_run: false })
      assert.equal(again.summary.skipped, 4)
      s.emA = await ctx.value(`select id from public.students where full_name = 'Em A'`)
      s.emB = await ctx.value(`select id from public.students where full_name = 'Em B'`)
    },

    'Nhập CSV khác khối với lớp đang học bị chặn': async (ctx) => {
      const r = await ctx.manager.rpc('import_students_bulk', { p_rows: [row(2, 'Em A', '0901000001', 'Toan_9_Lan_1')], p_dry_run: true })
      assert.equal(r.ok, false)
      assert.match(r.errors[0].message, /cùng khối/)
    },

    'Chuyển năm học: ngày có điểm danh sau đó bị từ chối; xem trước không đổi gì': async (ctx) => {
      await mark(ctx, { classId: s.c9.id, date: s.prev, items: [{ enrollment_id: await enrollmentOf(ctx, s.emB, s.c9.id), status: 'present' }] })
      const bad = await ctx.manager.rpc('rollover_school_year', { p_date: s.prev, p_dry_run: true })
      assert.equal(bad.ok, false)
      const preview = await ctx.manager.rpc('rollover_school_year', { p_date: s.today, p_dry_run: true })
      assert.equal(preview.ok, true, JSON.stringify(preview.errors))
      assert.deepEqual(preview.closed.map((c) => [c.name, c.students]), [['Toan_9_Lan_1', 2]])
      assert.deepEqual(preview.promoted.map((p) => [p.old_name, p.new_name]).sort(), [
        ['Toan_8_Lan_1', 'Toan_9_Lan_1'], ['VatLi_8_Lan_1', 'VatLi_9_Lan_1'],
      ])
      assert.equal(await ctx.value(`select grade from public.classes where id = $1`, [s.c8.id]), 8)
      assert.equal(await ctx.value(`select count(*)::int from public.class_enrollments where status = 'dropped'`), 0)
    },

    'Chuyển năm học thật: lớp 9 đóng (tốt nghiệp), lớp 8 lên 9 đổi tên, học sinh 2 lớp lên khối cùng nhau': async (ctx) => {
      await expectError(ctx.manager.rpc('rollover_school_year', { p_date: s.today, p_dry_run: false, p_confirm_text: 'sai' }), 'CHUYEN NAM HOC')
      const r = await ctx.manager.rpc('rollover_school_year', { p_date: s.today, p_dry_run: false, p_confirm_text: 'CHUYEN NAM HOC' })
      assert.equal(r.applied, true)
      assert.equal(await ctx.value(`select deleted_at is not null from public.classes where id = $1`, [s.c9.id]), true)
      assert.equal(await ctx.value(`select name from public.classes where id = $1`, [s.c8.id]), 'Toan_9_Lan_1')
      assert.deepEqual(await ctx.one(`select grade, deleted_at is null as visible from public.students where id = $1`, [s.emA]), { grade: 9, visible: true })
      assert.deepEqual(await ctx.one(`select deleted_at is not null as hidden from public.students where id = $1`, [s.emB]), { hidden: true })
      assert.equal(
        await ctx.value(`select string_agg(distinct left_reason, ',') from public.class_enrollments where class_id = $1`, [s.c9.id]),
        'graduated',
      )
      // Nhãn ngày cũ vẫn là tên cũ
      const label = await ctx.value(`select public.class_label_on($1, $2)`, [s.c8.id, s.prev])
      assert.equal(label.name, 'Toan_8_Lan_1')
    },

    'Tổng quan: học sinh tốt nghiệp không bị tính là "nghỉ hẳn"': async (ctx) => {
      const [y, m] = s.today.split('-').map(Number)
      const sum = await ctx.manager.rpc('dashboard_summary', { p_year: y, p_month: m })
      assert.equal(sum.graduated_students, 2)
      assert.equal(sum.dropped_students, 0)
    },

    'Báo cáo tháng cũ hiện tên lớp cũ và học phí theo giá đóng băng': async (ctx) => {
      const [y, m] = s.prev.split('-').map(Number)
      const r = await ctx.manager.rpc('export_monthly_attendance_report', { p_year: y, p_month: m })
      const emB = r.rows.find((x) => x.student_name === 'Em B')
      assert.deepEqual([emB.class_name, emB.total_tuition, emB.charged_sessions], ['Toan_9_Lan_1', 100000, 1])
    },

    'Nhật ký: lọc theo nhóm, Giáo viên không đọc được, có dòng chuyển năm học': async (ctx) => {
      const system = await ctx.manager.rpc('query_audit_logs', { p_action_group: 'system' })
      assert.ok(system.items.some((i) => i.action === 'school_year_rollover'))
      const enr = await ctx.manager.rpc('query_audit_logs', { p_action_group: 'enrollment', p_limit: 500 })
      assert.equal(enr.items.filter((i) => i.action === 'enrollment_graduate').length, 2)
      const att = await ctx.manager.rpc('query_audit_logs', { p_action_group: 'attendance', p_search: 'em b' })
      assert.equal(att.total, 1)
      const lan = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
      await expectError(lan.rpc('query_audit_logs', {}), 'Chỉ Quản lý')
    },

    'Xóa nhật ký cũ: phải khớp số dòng và cụm xác nhận; chủ Database cũng không xóa thẳng được': async (ctx) => {
      await expectError(ctx.sql(`delete from public.audit_log`), 'bảo vệ toàn vẹn')
      await ctx.sql(`select set_config('sciencehub.allow_audit_clear', 'on', false)`)
      await ctx.sql(`select set_config('sciencehub.allow_audit_clear', '', false)`)
      const yesterday = addDays(s.today, -1)
      await expectError(ctx.manager.rpc('clear_audit_logs_before', { p_before_date: yesterday, p_expected_count: 5, p_confirm_text: 'XOA NHAT KY' }), /khác số dòng|Không có dòng/)
    },

    'Sao lưu chọn bảng: chỉ xuất bảng được chọn, ghi nhật ký xuất': async (ctx) => {
      const b = await ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: '{students,classes}' })
      assert.deepEqual(Object.keys(b.tables).sort(), ['classes', 'students'])
      await expectError(ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: '{restore_staging}' }), 'không nằm trong danh sách')
      const logs = await ctx.manager.rpc('query_audit_logs', { p_action_group: 'system', p_search: 'xuất dữ liệu' })
      assert.ok(logs.total >= 1)
    },
  },
}
