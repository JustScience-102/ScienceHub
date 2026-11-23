// Sao lưu (.json) rồi khôi phục trên V3: dữ liệu về đúng như lúc sao lưu, tài khoản Giáo viên nối lại theo email,
// Quản lý và nhật ký giữ nguyên, bộ đếm mã không lùi; file của hệ thống cũ (V2) hoặc file sai bị từ chối.
import { assert, expectError } from './lib/assert.mjs'
import { applyRestore, previewRestore, stageBackup } from './lib/restore_helper.mjs'
import { addClass, addTeacher, enrollmentOf, mark, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
const studentCount = (ctx) => ctx.value(`select count(*)::int from public.students`)

export default {
  name: 'V3: sao lưu và khôi phục',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.lan = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.lanUser = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
    s.c1 = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.c2 = (await addClass(ctx, { teacherId: s.lan, subject: 'Toán', grade: 9 })).id
    s.an = await register(ctx, { classId: s.c1, name: 'Trần An', parentPhone: '0901000001' })
    s.binh = await register(ctx, { classId: s.c2, name: 'Lê Bình', parentPhone: '0901000002' })
    await mark(ctx, {
      classId: s.c1, date: s.today, items: [{ enrollment_id: await enrollmentOf(ctx, s.an, s.c1), status: 'present' }],
    })
    // Nhóm lớp đi cùng sao lưu/khôi phục (hai lớp cùng nội dung, không học sinh trùng).
    await ctx.manager.rpc('save_class_group', { p_group_id: null, p_name: 'Toán 9 cô Lan', p_parts: [[s.c1, s.c2]] })
    s.snap = await ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: null })
  },
  tests: {
    'File sao lưu là V3, có nhóm lớp và tài khoản Giáo viên kèm email': async () => {
      assert.equal(s.snap.metadata.version, 'V3')
      assert.equal(s.snap.tables.class_group_members.length, 2)
      assert.ok(s.snap.tables.profiles.some((p) => p.role === 'teacher' && p.email === 'lan@sciencehub.test'))
    },

    'Xem trước: không đổi gì, báo bảng so sánh': async (ctx) => {
      await register(ctx, { classId: s.c1, name: 'Sẽ Biến Mất', parentPhone: '0901000066' })
      await ctx.manager.rpc('delete_class_group', { p_group_id: await ctx.value(`select id from public.class_groups`) })
      s.runId = await stageBackup(ctx, s.snap)
      const r = await previewRestore(ctx, s.runId)
      assert.equal(r.ok, true, JSON.stringify(r.errors))
      assert.equal(r.applied, false)
      assert.equal(r.tables.find((t) => t.name === 'students').removed, 1)
      assert.equal(r.tables.find((t) => t.name === 'class_group_members').added, 2)
      assert.deepEqual(r.renamed, [])
      assert.equal(await studentCount(ctx), 3)
    },

    'Khôi phục thật: dữ liệu về đúng như lúc sao lưu': async (ctx) => {
      const r = await applyRestore(ctx, s.runId)
      assert.equal(r.applied, true)
      assert.deepEqual(r.warnings, [])
      const now = await ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: null })
      for (const name of ['parents', 'teachers', 'students', 'classes', 'class_schedules', 'class_enrollments',
        'attendance_records', 'class_versions', 'month_closures', 'class_groups']) {
        assert.deepEqual(sortById(now.tables[name]), sortById(s.snap.tables[name]), name)
      }
      assert.deepEqual(now.tables.class_group_members, s.snap.tables.class_group_members)
    },

    'Tài khoản Giáo viên nối lại theo email; Quản lý và nhật ký giữ nguyên, ghi thêm 1 dòng': async (ctx) => {
      const prof = await s.lanUser.rpc('my_profile')
      assert.deepEqual([prof.status, prof.role, prof.teacher_id], ['ok', 'teacher', s.lan])
      assert.equal(await ctx.value(`select count(*)::int from public.profiles where role = 'manager'`), 1)
      const logs = await ctx.sql(`select action, summary from public.audit_log order by created_at`)
      const restores = logs.filter((log) => log.action === 'center_restore')
      assert.ok(logs.length > restores.length, 'nhật ký trước khi khôi phục phải còn')
      assert.equal(restores.length, 1)
      assert.match(restores[0].summary, /Quản lý khôi phục dữ liệu từ file sao lưu/)
    },

    'Bộ đếm mã HS không lùi: học sinh mới nhận mã kế tiếp': async (ctx) => {
      const id = await register(ctx, { classId: s.c1, name: 'Học Sinh Mới', parentPhone: '0901000077' })
      assert.equal(await ctx.value(`select student_code from public.students where id = $1`, [id]), 'HS0004')
    },

    'File sao lưu của hệ thống cũ (V2) bị từ chối, không đổi gì': async (ctx) => {
      const before = await studentCount(ctx)
      const old = { ...s.snap, metadata: { ...s.snap.metadata, version: 'V2-6' } }
      const r = await previewRestore(ctx, await stageBackup(ctx, old))
      assert.equal(r.ok, false)
      assert.ok(r.errors.some((e) => /hệ thống cũ \(phiên bản V2-6\)/.test(e)), JSON.stringify(r.errors))
      assert.equal(await studentCount(ctx), before)
    },

    'File không phải của Trung tâm hoặc thiếu bảng bị từ chối; sai cụm xác nhận bị chặn': async (ctx) => {
      const before = await studentCount(ctx)
      const bad = { metadata: { center: 'Khác', version: 'V3' }, tables: { teachers: [] } }
      const r = await previewRestore(ctx, await stageBackup(ctx, bad))
      assert.equal(r.ok, false)
      assert.ok(r.errors.some((e) => /không phải bản sao lưu/.test(e)))
      assert.ok(r.errors.some((e) => /thiếu dữ liệu bảng "students"/.test(e)))
      assert.equal(await studentCount(ctx), before)
      await expectError(applyRestore(ctx, await stageBackup(ctx, s.snap), 'sai'), 'KHOI PHUC')
    },
  },
}
