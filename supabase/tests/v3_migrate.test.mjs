// Chuyển dữ liệu từ Supabase cũ (V2) sang project mới (V3) bằng file sao lưu V2, rồi kiểm tra dữ liệu
// nghiệp vụ khớp từng dòng, học phí từng học sinh từng tháng khớp, và V3 vận hành bình thường trên dữ liệu đó.
import { assert, expectError } from './lib/assert.mjs'
import { createContext } from './lib/harness.mjs'
import { applyRestore, previewRestore, stageBackup } from './lib/restore_helper.mjs'
import { ALL_DAYS, buildV2Dataset, exportV2Backup } from './lib/v2_dataset.mjs'
import { mark } from './lib/v3_helpers.mjs'

const s = {}

const sortById = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
const pick = (rows, keys) => sortById(rows).map((row) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null])))

function tuitionByStudentMonth(rows) {
  const out = {}
  for (const r of rows) {
    if (r.status === 'absent_excused') continue
    const key = `${r.student_id}|${String(r.attendance_date).slice(0, 7)}`
    out[key] = (out[key] ?? 0) + Number(r.price_snapshot)
  }
  return out
}

export default {
  name: 'V3: chuyển dữ liệu từ file sao lưu V2',
  base: 'v3',
  async setup(ctx) {
    const v2 = await createContext('v2')
    s.v2data = await buildV2Dataset(v2)
    // Một lớp đặt tên tay kiểu cũ (V2 nhận nguyên văn) để kiểm tra báo đổi tên khi chuyển.
    await v2.manager.rpc('save_class', {
      p_class_id: null, p_name: 'Lop Toan Tang Cuong', p_subject: 'Toán', p_grade: 9, p_class_no: 5,
      p_teacher_id: s.v2data.teachers.lan, p_price: 90000, p_schedule: ALL_DAYS, p_restore: false,
    })
    s.backup = await exportV2Backup(v2)
    await v2.db.close()
    // Project mới: Quản lý đã có; tạo lại user cho giáo viên với CÙNG email cũ (id user khác).
    s.lanUser = await ctx.createUser('lan@sciencehub.test')
  },
  tests: {
    'File V2 đúng định dạng V2 và có nhật ký cũ': async () => {
      assert.match(s.backup.metadata.version, /^V2/)
      assert.ok(s.backup.tables.audit_log.length > 10)
    },

    'Xem trước: không đổi gì, báo bảng so sánh và lớp sẽ đổi tên': async (ctx) => {
      s.runId = await stageBackup(ctx, s.backup)
      const r = await previewRestore(ctx, s.runId)
      assert.equal(r.ok, true, JSON.stringify(r.errors))
      assert.equal(r.applied, false)
      const students = r.tables.find((t) => t.name === 'students')
      assert.deepEqual([students.current, students.in_file, students.added], [0, 4, 4])
      assert.deepEqual(r.renamed, [{ old_name: 'Lop Toan Tang Cuong', new_name: 'Toan_9_Lan_5' }])
      assert.equal(await ctx.value(`select count(*)::int from public.students`), 0)
    },

    'Khôi phục thật: dữ liệu nghiệp vụ khớp file từng dòng': async (ctx) => {
      const r = await applyRestore(ctx, s.runId)
      assert.equal(r.applied, true)
      assert.deepEqual(r.warnings, [])
      const t = s.backup.tables
      const hidden = (rows) => sortById(rows).map((row) => [row.id, row.deleted_at !== null])
      const keysParents = ['id', 'parent_code', 'full_name', 'phone']
      const parents = await ctx.sql(`select * from public.parents`)
      assert.deepEqual(pick(parents, keysParents), pick(t.parents, keysParents))
      assert.deepEqual(hidden(parents), hidden(t.parents))
      const keysStudents = ['id', 'student_code', 'full_name', 'phone', 'parent_id', 'grade']
      const students = await ctx.sql(`select * from public.students`)
      assert.deepEqual(pick(students, keysStudents), pick(t.students, keysStudents))
      assert.deepEqual(hidden(students), hidden(t.students))
      const keysAtt = ['id', 'enrollment_id', 'class_id', 'student_id', 'status', 'price_snapshot']
      assert.deepEqual(pick(await ctx.sql(`select * from public.attendance_records`), keysAtt), pick(t.attendance_records, keysAtt))
      const keysEnr = ['id', 'class_id', 'student_id', 'status']
      assert.deepEqual(pick(await ctx.sql(`select * from public.class_enrollments`), keysEnr), pick(t.class_enrollments, keysEnr))
      assert.equal(await ctx.value(`select count(*)::int from public.class_schedules`), t.class_schedules.length)
    },

    'Học phí từng học sinh từng tháng khớp V2': async (ctx) => {
      const v3 = await ctx.sql(`select student_id, attendance_date::text, status, price_snapshot from public.attendance_records`)
      assert.deepEqual(tuitionByStudentMonth(v3), tuitionByStudentMonth(s.backup.tables.attendance_records))
    },

    'Lý do nghỉ được suy ra: đổi lớp có liên kết, nghỉ hẳn': async (ctx) => {
      const khoi = await ctx.sql(
        `select left_reason, transfer_to_id is not null as linked from public.class_enrollments where id = $1`,
        [s.v2data.enrollments.eKhoi],
      )
      assert.deepEqual(khoi, [{ left_reason: 'transferred', linked: true }])
      assert.equal(await ctx.value(`select left_reason from public.class_enrollments where id = $1`, [s.v2data.enrollments.eNgoc]), 'dropped')
    },

    'Tài khoản Giáo viên nối theo email với user mới; Quản lý giữ nguyên; nhật ký V2 không nạp': async (ctx) => {
      const prof = await s.lanUser.rpc('my_profile')
      assert.deepEqual([prof.status, prof.role, prof.teacher_id], ['ok', 'teacher', s.v2data.teachers.lan])
      assert.equal(await ctx.value(`select count(*)::int from public.profiles where role = 'manager'`), 1)
      const logs = await ctx.sql(`select action from public.audit_log`)
      assert.deepEqual(logs.map((l) => l.action), ['center_restore'])
      assert.match(await ctx.value(`select summary from public.audit_log`), /Chuyển dữ liệu từ hệ thống cũ/)
    },

    'Bộ đếm mã HS/PH không lùi: học sinh mới nhận mã kế tiếp': async (ctx) => {
      const id = await ctx.manager.rpc('register_student_in_class', {
        p_class_id: s.v2data.classes.toan9, p_joined_at: await ctx.today(), p_full_name: 'Học Sinh Mới',
        p_phone: null, p_parent_name: 'PH Mới', p_parent_phone: '0901000077',
      })
      assert.equal(await ctx.value(`select student_code from public.students where id = $1`, [id]), 'HS0005')
    },

    'V3 vận hành bình thường trên dữ liệu chuyển sang': async (ctx) => {
      const today = await ctx.today()
      const rows = await mark(ctx, { actor: s.lanUser, classId: s.v2data.classes.toan9, date: today,
        items: [{ enrollment_id: s.v2data.enrollments.eAnh, status: 'present' }] })
      assert.equal(rows[0].price_snapshot, 160000)
      const legacy = await ctx.value(
        `select id from public.attendance_records where class_id = $1 and makeup_of_date is null`, [s.v2data.classes.toan9b],
      )
      await expectError(ctx.manager.rpc('cancel_makeup', { p_record_id: legacy }), 'không phải buổi học bù có liên kết')
      assert.equal(await ctx.value(`select name from public.classes where id = $1`, [s.v2data.classes.toan9]), 'Toan_9_Lan_1')
    },

    'Sao lưu V3 rồi khôi phục lại: dữ liệu về đúng như lúc sao lưu': async (ctx) => {
      const snap = await ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: null })
      assert.equal(snap.metadata.version, 'V3')
      await ctx.manager.rpc('register_student_in_class', {
        p_class_id: s.v2data.classes.toan9, p_joined_at: await ctx.today(), p_full_name: 'Sẽ Biến Mất',
        p_phone: null, p_parent_name: 'PH', p_parent_phone: '0901000066',
      })
      const runId = await stageBackup(ctx, snap)
      const preview = await previewRestore(ctx, runId)
      assert.equal(preview.tables.find((t) => t.name === 'students').removed, 1)
      await applyRestore(ctx, runId)
      const now = await ctx.manager.rpc('export_center_backup', { p_include_audit_log: false, p_tables: null })
      for (const name of ['parents', 'teachers', 'students', 'classes', 'class_schedules', 'class_enrollments',
        'attendance_records', 'class_versions', 'month_closures']) {
        assert.deepEqual(sortById(now.tables[name]), sortById(snap.tables[name]), name)
      }
    },

    'File không phải của Trung tâm hoặc thiếu bảng bị từ chối, không đổi gì': async (ctx) => {
      const before = await ctx.value(`select count(*)::int from public.students`)
      const bad = { metadata: { center: 'Khác', version: 'V3' }, tables: { teachers: [] } }
      const r = await previewRestore(ctx, await stageBackup(ctx, bad))
      assert.equal(r.ok, false)
      assert.ok(r.errors.some((e) => /không phải bản sao lưu/.test(e)))
      assert.ok(r.errors.some((e) => /thiếu dữ liệu bảng "students"/.test(e)))
      assert.equal(await ctx.value(`select count(*)::int from public.students`), before)
      await expectError(applyRestore(ctx, await stageBackup(ctx, s.backup), 'sai'), 'KHOI PHUC')
    },
  },
}
