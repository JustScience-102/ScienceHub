// Nhóm lớp: lớp cùng nội dung bài học (cùng phần) không có học sinh trùng nhau (chặn cứng),
// học sinh thiếu phần nào thì cảnh báo. Ví dụ 4 lớp Vật Lí 12: phần 1 = lớp 1, 2; phần 2 = lớp 3, 4.
import { assert, expectError } from './lib/assert.mjs'
import { addClass, addTeacher, enrollmentOf, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
const enroll = (ctx, classId, studentId, actor = ctx.manager) =>
  actor.rpc('enroll_existing_student', { p_class_id: classId, p_student_id: studentId, p_joined_at: s.today })
const save = (ctx, parts, { id = null, name = 'Vật Lí 12', actor = ctx.manager } = {}) =>
  actor.rpc('save_class_group', { p_group_id: id, p_name: name, p_parts: parts })
const overview = async (actor) => (await actor.rpc('class_groups_overview')).find((g) => g.name === 'Vật Lí 12')
const csvRow = (line, studentName, parentPhone, className) => ({
  line, student_name: studentName, student_phone: '', parent_name: '', parent_phone: parentPhone,
  class_name: className, joined_at: '',
})

export default {
  name: 'V3: nhóm lớp (lớp cùng nội dung không trùng học sinh)',
  base: 'v3',
  async setup(ctx) {
    s.today = await ctx.today()
    s.lan = await addTeacher(ctx, 'Nguyễn Thị Lan')
    s.hung = await addTeacher(ctx, 'Trần Văn Hùng')
    s.l = []
    for (let i = 0; i < 4; i += 1) s.l.push(await addClass(ctx, { teacherId: s.lan, subject: 'Vật Lí', grade: 12 }))
    s.hungLi = await addClass(ctx, { teacherId: s.hung, subject: 'Vật Lí', grade: 12 })
    s.ids = s.l.map((c) => c.id)
    s.an = await register(ctx, { classId: s.ids[0], name: 'Lê Văn An', parentPhone: '0901000001' })
    s.binh = await register(ctx, { classId: s.ids[0], name: 'Phạm Bình', parentPhone: '0901000002' })
    // Bình học cả lớp 1 và lớp 2 trước khi có nhóm (dữ liệu cũ vi phạm)
    await enroll(ctx, s.ids[1], s.binh)
    s.lanUser = await teacherAccount(ctx, s.lan, 'lan@sciencehub.test')
  },
  tests: {
    'Tên lớp tự sinh đúng mẫu (để dễ đọc các thông báo bên dưới)': async () => {
      assert.deepEqual(s.l.map((c) => c.name), ['VatLi_12_Lan_1', 'VatLi_12_Lan_2', 'VatLi_12_Lan_3', 'VatLi_12_Lan_4'])
    },

    'Chỉ Quản lý cấu hình được nhóm lớp': async (ctx) => {
      await expectError(save(ctx, [[s.ids[0], s.ids[1]]], { actor: s.lanUser }), 'Chỉ Quản lý')
    },

    'Dữ liệu nhóm không hợp lệ bị từ chối rõ ràng': async (ctx) => {
      await expectError(save(ctx, [[s.ids[0]]]), 'ít nhất hai lớp')
      await expectError(save(ctx, [[s.ids[0], s.ids[1]], []]), 'Phần 2 chưa có lớp')
      await expectError(save(ctx, [[s.ids[0], s.ids[1]], [s.ids[1]]]), 'chỉ được xếp vào một phần')
      await expectError(save(ctx, [[s.ids[0], s.ids[1]]], { name: '  ' }), 'tên nhóm')
    },

    'Đang có học sinh học hai lớp cùng phần: chưa cho lưu, nêu tên em đó': async (ctx) => {
      await expectError(save(ctx, [[s.ids[0], s.ids[1]], [s.ids[2], s.ids[3]]]), 'Phạm Bình')
      assert.equal(await ctx.value(`select count(*)::int from public.class_groups`), 0)
    },

    'Cho em nghỉ một lớp thì lưu được nhóm; nhật ký ghi lại': async (ctx) => {
      await ctx.manager.rpc('drop_enrollment', {
        p_enrollment_id: await enrollmentOf(ctx, s.binh, s.ids[1]), p_left_at: s.today, p_delete_attendance: false,
      })
      s.group = await save(ctx, [[s.ids[0], s.ids[1]], [s.ids[2], s.ids[3]]])
      const log = await ctx.manager.rpc('query_audit_logs', { p_action_group: 'class', p_search: 'nhóm lớp' })
      assert.ok(log.items.some((i) => i.action === 'class_group_save' && /Phần 2: VatLi_12_Lan_3, VatLi_12_Lan_4/.test(i.summary)))
    },

    'Ghi danh thêm vào lớp cùng phần bị chặn (kể cả Giáo viên); lớp khác phần thì được': async (ctx) => {
      await expectError(enroll(ctx, s.ids[1], s.an), 'cùng nội dung bài học')
      await expectError(enroll(ctx, s.ids[1], s.an, s.lanUser), 'cùng nội dung bài học')
      await enroll(ctx, s.ids[2], s.an)
      await expectError(enroll(ctx, s.ids[3], s.an), 'nhóm lớp "Vật Lí 12", phần 2')
    },

    'Đổi lớp giữa hai lớp cùng phần vẫn được': async (ctx) => {
      await ctx.manager.rpc('transfer_enrollment', {
        p_enrollment_id: await enrollmentOf(ctx, s.an, s.ids[2]), p_new_class_id: s.ids[3], p_date: s.today,
        p_delete_attendance: false,
      })
      const active = await ctx.sql(`select class_id from public.class_enrollments where student_id = $1 and status = 'active' order by class_id`, [s.an])
      assert.deepEqual(active.map((r) => r.class_id).sort(), [s.ids[0], s.ids[3]].sort())
    },

    'Đăng ký học sinh mới vào lớp của nhóm bình thường': async (ctx) => {
      s.chi = await register(ctx, { classId: s.ids[2], name: 'Võ Chi', parentPhone: '0901000003' })
    },

    'Cảnh báo: tổng từng phần và học sinh còn thiếu phần': async (ctx) => {
      const g = await overview(ctx.manager)
      assert.deepEqual(g.parts.map((p) => [p.part_no, p.student_count]), [[1, 2], [2, 2]])
      assert.deepEqual(g.parts[0].classes.map((c) => [c.name, c.student_count]), [['VatLi_12_Lan_1', 2], ['VatLi_12_Lan_2', 0]])
      // An đủ cả hai phần; Bình chỉ phần 1; Chi chỉ phần 2
      assert.deepEqual(
        g.incomplete.map((x) => [x.full_name, x.missing_parts]),
        [['Phạm Bình', [2]], ['Võ Chi', [1]]],
      )
      assert.deepEqual(g.overlaps, [])
      await enroll(ctx, s.ids[3], s.binh)
      await enroll(ctx, s.ids[1], s.chi)
      const done = await overview(ctx.manager)
      assert.deepEqual(done.incomplete, [])
      assert.deepEqual(done.parts.map((p) => p.student_count), [3, 3])
    },

    'Nhập CSV: xếp em vào lớp cùng phần với lớp đang học, hoặc hai lớp cùng phần trong file, đều bị báo lỗi': async (ctx) => {
      const existing = await ctx.manager.rpc('import_students_bulk', {
        p_rows: [csvRow(2, 'Lê Văn An', '0901000001', 'VatLi_12_Lan_2')], p_dry_run: true,
      })
      assert.equal(existing.ok, false)
      assert.match(existing.errors[0].message, /đang\/được xếp vào lớp VatLi_12_Lan_1.*cùng nội dung/)
      const inFile = await ctx.manager.rpc('import_students_bulk', {
        p_rows: [csvRow(2, 'Em Mới', '0901000009', 'VatLi_12_Lan_3'), csvRow(3, 'Em Mới', '0901000009', 'VatLi_12_Lan_4')],
        p_dry_run: false,
      })
      assert.equal(inFile.applied, false)
      assert.deepEqual(inFile.errors.map((e) => e.line), [3])
      assert.equal(await ctx.value(`select count(*)::int from public.students where full_name = 'Em Mới'`), 0)
      const ok = await ctx.manager.rpc('import_students_bulk', {
        p_rows: [csvRow(2, 'Em Mới', '0901000009', 'VatLi_12_Lan_3'), csvRow(3, 'Em Mới', '0901000009', 'VatLi_12_Lan_1')],
        p_dry_run: true,
      })
      assert.equal(ok.ok, true, JSON.stringify(ok.errors))
    },

    'Một lớp chỉ thuộc một nhóm; lớp ẩn không thêm mới được vào nhóm': async (ctx) => {
      await expectError(save(ctx, [[s.ids[0], s.hungLi.id]], { name: 'Nhóm khác' }), 'đã thuộc nhóm khác')
      const extra = await addClass(ctx, { teacherId: s.lan, subject: 'Vật Lí', grade: 12 })
      await ctx.manager.rpc('set_class_hidden', { p_class_id: extra.id, p_hidden: true })
      await expectError(
        save(ctx, [[s.ids[0], s.ids[1], extra.id], [s.ids[2], s.ids[3]]], { id: s.group }),
        'đang bị ẩn',
      )
    },

    'Giáo viên chỉ thấy nhóm mà mọi lớp đều do mình dạy': async (ctx) => {
      assert.ok(await overview(s.lanUser))
      // Thêm lớp của thầy Hùng vào nhóm: cô Lan không còn thấy nhóm (tránh lộ học sinh lớp khác)
      await save(ctx, [[s.ids[0], s.ids[1]], [s.ids[2], s.ids[3], s.hungLi.id]], { id: s.group })
      assert.equal(await overview(s.lanUser), undefined)
      assert.ok(await overview(ctx.manager))
      await save(ctx, [[s.ids[0], s.ids[1]], [s.ids[2], s.ids[3]]], { id: s.group })
    },

    'Xóa nhóm: không chặn nữa; lớp, học sinh, ghi danh giữ nguyên': async (ctx) => {
      const before = await ctx.value(`select count(*)::int from public.class_enrollments where status = 'active'`)
      await expectError(s.lanUser.rpc('delete_class_group', { p_group_id: s.group }), 'Chỉ Quản lý')
      await ctx.manager.rpc('delete_class_group', { p_group_id: s.group })
      assert.equal(await ctx.value(`select count(*)::int from public.class_groups`), 0)
      assert.equal(await ctx.value(`select count(*)::int from public.class_enrollments where status = 'active'`), before)
      await enroll(ctx, s.ids[1], s.an)
      assert.equal(await ctx.value(`select count(*)::int from public.audit_log where action = 'class_group_delete'`), 1)
    },
  },
}
