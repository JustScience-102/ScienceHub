// Tên lớp do Database tự sinh: Môn_Khối_TênGọiGV_STT, thêm chữ A/B khi trùng tên gọi cùng môn,
// đổi họ tên giáo viên thì tên lớp và lịch sử nhãn lớp đổi theo.
import { assert, expectError } from './lib/assert.mjs'
import { ALL_DAYS, addClass, addTeacher } from './lib/v3_helpers.mjs'

const s = {}
const nameOf = (ctx, id) => ctx.value(`select name from public.classes where id = $1`, [id])

export default {
  name: 'V3: tên lớp do Database sinh',
  base: 'v3',
  async setup(ctx) {
    s.lam = await addTeacher(ctx, 'Nguyễn Văn Lam')
    s.nam = await addTeacher(ctx, 'Lê Hoài Nam')
  },
  tests: {
    'Token môn và tên gọi khớp quy tắc frontend (bỏ dấu, đ -> d, viết hoa chữ đầu)': async (ctx) => {
      assert.equal(await ctx.value(`select public._subject_token('Vật Lí')`), 'VatLi')
      assert.equal(await ctx.value(`select public._subject_token('Khoa học tự nhiên')`), 'KhoaHocTuNhien')
      assert.equal(await ctx.value(`select public._subject_token('  Hóa   học ')`), 'HoaHoc')
      assert.equal(await ctx.value(`select public._teacher_base_token('Phạm Thị Đức')`), 'Duc')
      assert.equal(await ctx.value(`select public._teacher_base_token('Trần  Văn   Ngọc')`), 'Ngoc')
    },

    'Lớp mới: tên tự sinh, STT tự chọn số nhỏ nhất còn trống': async (ctx) => {
      const a = await addClass(ctx, { teacherId: s.lam, subject: 'Toán', grade: 9 })
      const b = await addClass(ctx, { teacherId: s.lam, subject: 'Toán', grade: 9 })
      assert.equal(a.name, 'Toan_9_Lam_1')
      assert.equal(b.name, 'Toan_9_Lam_2')
      s.toanLam1 = a.id
      s.toanLam2 = b.id
    },

    'STT đã có lớp thì báo lỗi rõ ràng': async (ctx) => {
      await expectError(addClass(ctx, { teacherId: s.lam, subject: 'Toán', grade: 9, classNo: 1 }), 'STT 1 đã được dùng bởi lớp Toan_9_Lam_1')
    },

    'Xem trước tên lớp đúng như Database sẽ đặt': async (ctx) => {
      const preview = await ctx.manager.rpc('preview_class_name', {
        p_class_id: null, p_subject: 'Toán', p_grade: 9, p_teacher_id: s.lam, p_class_no: null,
      })
      assert.deepEqual(preview, { name: 'Toan_9_Lam_3', class_no: 3, taken: false })
    },

    'Thầy Lâm mới dạy Vật Lí: không trùng môn nên không thêm chữ': async (ctx) => {
      s.lam2 = await addTeacher(ctx, 'Trần Lâm')
      const li = await addClass(ctx, { teacherId: s.lam2, subject: 'Vật Lí', grade: 10 })
      assert.equal(li.name, 'VatLi_10_Lam_1')
      assert.equal(await nameOf(ctx, s.toanLam1), 'Toan_9_Lam_1')
      s.liLam2 = li.id
    },

    'Thầy Lâm dạy thêm Toán: cả hai thêm chữ theo thứ tự thêm vào Trung tâm': async (ctx) => {
      const toan = await addClass(ctx, { teacherId: s.lam2, subject: 'Toán', grade: 9 })
      assert.equal(toan.name, 'Toan_9_LamB_1')
      assert.equal(await nameOf(ctx, s.toanLam1), 'Toan_9_LamA_1')
      assert.equal(await nameOf(ctx, s.toanLam2), 'Toan_9_LamA_2')
      assert.equal(await nameOf(ctx, s.liLam2), 'VatLi_10_Lam_1')
      s.toanLam2b = toan.id
      const log = await ctx.value(`select count(*)::int from public.audit_log where action = 'class_update' and summary like '%Toan_9_Lam_1 -> Toan_9_LamA_1%'`)
      assert.equal(log, 1)
    },

    'Đã thêm chữ thì giữ luôn, kể cả khi thầy Lâm thôi dạy Toán (lớp ẩn)': async (ctx) => {
      await ctx.manager.rpc('set_class_hidden', { p_class_id: s.toanLam2b, p_hidden: true })
      assert.equal(await nameOf(ctx, s.toanLam1), 'Toan_9_LamA_1')
    },

    'Sửa họ tên giáo viên: tên lớp đổi theo, lịch sử nhãn lớp cũng đổi theo': async (ctx) => {
      const nam9 = await addClass(ctx, { teacherId: s.nam, subject: 'Anh', grade: 9 })
      // Đổi khối làm phát sinh 1 thời kỳ cũ trong lịch sử (lớp tạo từ hôm trước)
      await ctx.sql(`update public.classes set created_at = now() - interval '10 days' where id = $1`, [nam9.id])
      await ctx.manager.rpc('save_class', {
        p_class_id: nam9.id, p_subject: 'Anh', p_grade: 8, p_class_no: null, p_teacher_id: s.nam,
        p_price: 100000, p_schedule: ALL_DAYS,
      })
      assert.equal(await nameOf(ctx, nam9.id), 'Anh_8_Nam_1')
      const before = await ctx.one(`select name, teacher_name from public.class_versions_labeled where class_id = $1`, [nam9.id])
      assert.deepEqual(before, { name: 'Anh_9_Nam_1', teacher_name: 'Lê Hoài Nam' })

      await ctx.manager.rpc('save_teacher', { p_teacher_id: s.nam, p_full_name: 'Lê Hoài Năm', p_phone: null, p_email: null })
      await ctx.manager.rpc('save_teacher', { p_teacher_id: s.nam, p_full_name: 'Lê Hoài Phong', p_phone: null, p_email: null })
      assert.equal(await nameOf(ctx, nam9.id), 'Anh_8_Phong_1')
      const after = await ctx.one(`select name, teacher_name from public.class_versions_labeled where class_id = $1`, [nam9.id])
      assert.deepEqual(after, { name: 'Anh_9_Phong_1', teacher_name: 'Lê Hoài Phong' })
      const label = await ctx.value(`select public.class_label_on($1, current_date - 5)`, [nam9.id])
      assert.equal(label.name, 'Anh_9_Phong_1')
    },

    'Khôi phục lớp ẩn khi STT đã có lớp khác: tự lấy STT kế tiếp': async (ctx) => {
      await ctx.manager.rpc('set_class_hidden', { p_class_id: s.toanLam2, p_hidden: true })
      const c = await addClass(ctx, { teacherId: s.lam, subject: 'Toán', grade: 9, classNo: 2 })
      assert.equal(c.name, 'Toan_9_LamA_2')
      const restored = await ctx.manager.rpc('set_class_hidden', { p_class_id: s.toanLam2, p_hidden: false })
      assert.equal(restored.name, 'Toan_9_LamA_3')
    },

    'Khôi phục lớp của giáo viên đã ẩn: phải chọn giáo viên khác (lịch sử giữ chữ A/B)': async (ctx) => {
      // Lớp mở từ 10 ngày trước nên đổi giáo viên sinh 1 thời kỳ cũ: thầy Lâm vẫn "từng dạy" Vật Lí.
      await ctx.sql(`update public.classes set created_at = now() - interval '10 days' where id = $1`, [s.liLam2])
      await ctx.manager.rpc('set_class_hidden', { p_class_id: s.liLam2, p_hidden: true })
      await ctx.manager.rpc('set_teacher_hidden', { p_teacher_id: s.lam2, p_hidden: true })
      await expectError(ctx.manager.rpc('set_class_hidden', { p_class_id: s.liLam2, p_hidden: false }), 'đang bị ẩn')
      const restored = await ctx.manager.rpc('set_class_hidden', { p_class_id: s.liLam2, p_hidden: false, p_teacher_id: s.lam })
      assert.equal(restored.name, 'VatLi_10_LamA_1')
    },

    'Các lớp đang hiển thị luôn có tên khác nhau': async (ctx) => {
      const dup = await ctx.value(`select count(*)::int from (select lower(name) from public.classes where deleted_at is null group by 1 having count(*) > 1) x`)
      assert.equal(dup, 0)
    },
  },
}
