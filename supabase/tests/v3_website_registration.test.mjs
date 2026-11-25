// Trang giới thiệu, mốc M3 (11_website.sql): đơn đăng ký học từ form của web (website.submit_registration, chỉ
// tài khoản website_link gọi) và màn hình "Đơn đăng ký" của app quản lý (list_registration_requests,
// set_registration_status, registration_requests_summary: chỉ Quản lý).
// Quy tắc chọn lịch: mỗi môn một lớp lẻ, HOẶC đúng một ca ở mỗi phần của một nhóm lớp; đúng khối; không trùng giờ.
import { assert, expectDenied, expectError } from './lib/assert.mjs'
import { readSql } from './lib/harness.mjs'
import { addClass, addTeacher, register, teacherAccount } from './lib/v3_helpers.mjs'

const s = {}
let seq = 0

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

// Đơn hợp lệ mặc định; mỗi lần gọi một SĐT phụ huynh + IP khác nhau để không đụng luật gửi trùng / chống spam.
function form(overrides = {}) {
  seq += 1
  return {
    student_name: `Học Sinh Số ${seq}`,
    grade: 12,
    school: 'THPT Bãi Cháy',
    student_phone: '',
    parent_name: 'Phụ Huynh',
    parent_phone: `0977${String(seq).padStart(6, '0')}`,
    referrer_code: '',
    note: '',
    class_ids: [s.li[0], s.li[2]],
    ...overrides,
  }
}
const submit = async (ctx, data, ip = `ip-${seq}`) =>
  (await asLink(ctx, 'select website.submit_registration($1, $2) as r', [typeof data === 'string' ? data : JSON.stringify(data), ip]))[0].r
const row = (ctx, id) => ctx.one('select * from website.registration_requests where id = $1', [id])

export default {
  name: 'V3: trang giới thiệu – đơn đăng ký học (submit_registration, Đơn đăng ký)',
  base: 'v3',
  async setup(ctx) {
    await ctx.exec('create role website_link nologin noinherit')
    await ctx.exec(readSql('supabase/v3/11_website.sql'))
    await ctx.exec(readSql('supabase/v3/09_grants.sql'))

    s.nam = await addTeacher(ctx, 'Nguyễn Hải Nam', '0912000031')
    const one = (day, start = '18:00', end = '20:00') => [{ day, start, end }]
    // Vật Lí 12: phần 1 = li[0] (Thứ 2), li[1] (Thứ 5); phần 2 = li[2] (Thứ 3), li[3] (Thứ 6); li[4] lớp lẻ (Chủ nhật).
    s.li = []
    for (const day of [2, 5, 3, 6, 8]) {
      s.li.push((await addClass(ctx, { teacherId: s.nam, subject: 'Vật Lí', grade: 12, schedule: one(day) })).id)
    }
    await ctx.manager.rpc('save_class_group', { p_group_id: null, p_name: 'Vật Lí 12', p_parts: [[s.li[0], s.li[1]], [s.li[2], s.li[3]]] })
    // Hóa học 12: phần 1 = hoa[0] (Thứ 2 18:30, trùng giờ Lí Thứ 2), hoa[1] (Thứ 4); phần 2 = hoa[2] (Thứ 7).
    s.hoa = []
    for (const [day, start, end] of [[2, '18:30', '20:30'], [4, '18:00', '20:00'], [7, '18:00', '20:00']]) {
      s.hoa.push((await addClass(ctx, { teacherId: s.nam, subject: 'Hóa học', grade: 12, schedule: one(day, start, end) })).id)
    }
    await ctx.manager.rpc('save_class_group', { p_group_id: null, p_name: 'Hóa học 12', p_parts: [[s.hoa[0], s.hoa[1]], [s.hoa[2]]] })
    s.hoa11 = (await addClass(ctx, { teacherId: s.nam, subject: 'Hóa học', grade: 11, schedule: one(4) })).id
    s.hidden = (await addClass(ctx, { teacherId: s.nam, subject: 'Vật Lí', grade: 12, schedule: one(7, '07:00', '09:00') })).id
    await ctx.manager.rpc('set_class_hidden', { p_class_id: s.hidden, p_hidden: true })
    // Học sinh đang học (để làm người giới thiệu) và phụ huynh đã có trong app.
    s.an = await register(ctx, { classId: s.li[4], name: 'Lê Văn An', parentName: 'Lê Văn Hùng', parentPhone: '0901000031' })
    s.anCode = await ctx.value('select student_code from public.students where id = $1', [s.an])
    s.lanUser = await teacherAccount(ctx, s.nam, 'nam.reg@sciencehub.test')
  },
  tests: {
    'Đơn đúng: Lí 12 một ca mỗi phần + Hóa 12 một ca mỗi phần; chuẩn hóa SĐT, mã giới thiệu, lưu ảnh chụp lựa chọn': async (ctx) => {
      const r = await submit(ctx, form({
        student_name: '  Trần   Thị  Bình ',
        parent_phone: '+84 901 000 031',
        student_phone: '0988.000.031',
        referrer_code: s.anCode.toLowerCase(),
        class_ids: [s.li[0], s.li[2], s.hoa[1], s.hoa[2]],
      }))
      assert.equal(r.updated, false)
      const saved = await row(ctx, r.id)
      s.binhId = r.id
      assert.equal(saved.student_name, 'Trần Thị Bình')
      assert.equal(saved.parent_phone, '0901000031')
      assert.equal(saved.student_phone, '0988000031')
      assert.equal(saved.referrer_code, s.anCode)
      assert.equal(saved.status, 'new')
      assert.equal(saved.choices.length, 4)
      const li1 = saved.choices.find((c) => c.class_id === s.li[0])
      assert.equal(li1.part, 1)
      assert.equal(li1.teacher, 'Nguyễn Hải Nam')
      assert.deepEqual(li1.schedule, [{ day: 2, start: '18:00', end: '20:00' }])
    },

    'Một lớp lẻ (không thuộc nhóm) là đủ cho môn đó': async (ctx) => {
      const r = await submit(ctx, form({ class_ids: [s.li[4]] }))
      assert.equal((await row(ctx, r.id)).choices.length, 1)
    },

    'Chặn 2 ca cùng phần, thiếu phần, lẫn lớp lẻ với nhóm': async (ctx) => {
      await expectError(submit(ctx, form({ class_ids: [s.li[0], s.li[1], s.li[2]] })), 'không chọn 2 ca của cùng Phần 1')
      await expectError(submit(ctx, form({ class_ids: [s.li[0]] })), 'còn thiếu ca của Phần 2')
      await expectError(submit(ctx, form({ class_ids: [s.li[0], s.li[2], s.li[4]] })), 'chỉ chọn một lịch học')
    },

    'Phần đã chọn của môn khác không được tính bù cho phần còn thiếu': async (ctx) => {
      // Lí chỉ có phần 1, Hóa có đủ 2 phần: Lí vẫn thiếu Phần 2.
      await expectError(submit(ctx, form({ class_ids: [s.li[0], s.hoa[1], s.hoa[2]] })), /Vật Lí: còn thiếu ca của Phần 2/)
    },

    'Chặn trùng giờ, lớp đã ẩn, lớp khác khối': async (ctx) => {
      await expectError(submit(ctx, form({ class_ids: [s.li[0], s.li[2], s.hoa[0], s.hoa[2]] })), 'trùng giờ')
      await expectError(submit(ctx, form({ class_ids: [s.hidden] })), 'không còn mở')
      await expectError(submit(ctx, form({ class_ids: [s.hoa11] })), 'không đúng khối 12')
    },

    'Kiểm tra thông tin: họ tên, SĐT, mã giới thiệu, chọn lịch, dữ liệu hỏng': async (ctx) => {
      await expectError(submit(ctx, form({ student_name: 'A' })), 'họ tên của con')
      await expectError(submit(ctx, form({ parent_name: '' })), 'họ tên phụ huynh')
      await expectError(submit(ctx, form({ parent_phone: '091234' })), 'Số điện thoại phụ huynh')
      await expectError(submit(ctx, form({ student_phone: '12345' })), 'Số điện thoại của con')
      await expectError(submit(ctx, form({ grade: 13 })), 'khối lớp')
      await expectError(submit(ctx, form({ referrer_code: 'AB12' })), 'có dạng HS')
      await expectError(submit(ctx, form({ referrer_code: 'HS9999' })), 'Không tìm thấy mã học sinh giới thiệu HS9999')
      await expectError(submit(ctx, form({ class_ids: [] })), 'ít nhất một môn')
      await expectError(submit(ctx, form({ class_ids: ['khong-phai-uuid'] })), 'không hợp lệ')
      await expectError(submit(ctx, '{hỏng'), 'không đọc được')
    },

    'Gửi lại cùng SĐT + cùng họ tên (khác hoa thường, khoảng trắng) trong 7 ngày: cập nhật đơn cũ': async (ctx) => {
      const before = await ctx.value('select count(*)::int from website.registration_requests')
      // Lần gửi sau thay toàn bộ nội dung lần trước (kể cả mã giới thiệu), nên gửi lại đủ.
      const r = await submit(ctx, form({
        student_name: 'trần thị   bình', parent_phone: '0901000031', class_ids: [s.li[1], s.li[3]], referrer_code: s.anCode,
      }))
      assert.equal(r.updated, true)
      assert.equal(r.id, s.binhId)
      assert.equal(await ctx.value('select count(*)::int from website.registration_requests'), before)
      assert.deepEqual((await row(ctx, s.binhId)).class_ids.sort(), [s.li[1], s.li[3]].sort())
    },

    'Chống spam: tối đa 10 đơn mới mỗi giờ mỗi IP, 5 đơn mới mỗi ngày mỗi SĐT': async (ctx) => {
      for (let i = 0; i < 10; i += 1) await submit(ctx, form(), 'ip-spam')
      await expectError(submit(ctx, form(), 'ip-spam'), 'nhiều đơn')
      const phone = '0966000111'
      for (let i = 0; i < 5; i += 1) await submit(ctx, form({ parent_phone: phone }))
      await expectError(submit(ctx, form({ parent_phone: phone })), 'nhiều đơn')
    },

    'Quản lý xem đơn: người giới thiệu, phụ huynh đã có trong app, lọc trạng thái, đếm đơn mới': async (ctx) => {
      const all = await ctx.manager.rpc('list_registration_requests', { p_status: null })
      const binh = all.find((x) => x.id === s.binhId)
      assert.deepEqual(binh.referrer, { code: s.anCode, name: 'Lê Văn An', active: true })
      assert.equal(binh.parent_match.full_name, 'Lê Văn Hùng')
      assert.deepEqual(binh.parent_match.children.map((c) => c.full_name), ['Lê Văn An'])
      assert.equal(binh.choices.length, 2)
      assert.ok(!('ip_hash' in binh), 'không trả mã IP')
      const summary = await ctx.manager.rpc('registration_requests_summary')
      assert.equal(summary.new, all.length)
      assert.equal(summary.contacted, 0)
    },

    'Đổi trạng thái kèm ghi chú; lọc theo trạng thái; trạng thái sai bị chặn': async (ctx) => {
      const res = await ctx.manager.rpc('set_registration_status', { p_id: s.binhId, p_status: 'contacted', p_staff_note: 'Đã gọi, hẹn thứ 7' })
      assert.equal(res.status, 'contacted')
      assert.equal(res.staff_note, 'Đã gọi, hẹn thứ 7')
      const kept = await ctx.manager.rpc('set_registration_status', { p_id: s.binhId, p_status: 'enrolled' })
      assert.equal(kept.staff_note, 'Đã gọi, hẹn thứ 7', 'không truyền ghi chú thì giữ ghi chú cũ')
      const enrolled = await ctx.manager.rpc('list_registration_requests', { p_status: 'enrolled' })
      assert.deepEqual(enrolled.map((x) => x.id), [s.binhId])
      await expectError(ctx.manager.rpc('set_registration_status', { p_id: s.binhId, p_status: 'xoa' }), 'không hợp lệ')
      // Gửi lại sau khi đơn đã xử lý: tạo đơn mới, không sửa đơn đã xếp lớp.
      const again = await submit(ctx, form({ student_name: 'Trần Thị Bình', parent_phone: '0901000031' }))
      assert.equal(again.updated, false)
    },

    'Giáo viên, người lạ, anon không xem/sửa được đơn; giao diện không gọi được hàm nhận đơn': async (ctx) => {
      await expectDenied(s.lanUser.rpc('list_registration_requests', { p_status: null }))
      await expectDenied(s.lanUser.rpc('set_registration_status', { p_id: s.binhId, p_status: 'new' }))
      await expectDenied(ctx.anon.rpc('registration_requests_summary'))
      await expectDenied(ctx.anon.query('select website.submit_registration($1, $2)', ['{}', null]))
      await expectDenied(ctx.manager.query('select website.submit_registration($1, $2)', ['{}', null]))
      await expectDenied(ctx.manager.query('select * from website.registration_requests'))
    },

    'website_link chỉ gọi được hàm nhận đơn, không đọc bảng đơn, không gọi RPC của Quản lý': async (ctx) => {
      await expectDenied(asLink(ctx, 'select * from website.registration_requests'))
      await expectDenied(asLink(ctx, 'select public.list_registration_requests(null)'))
    },

    'Chạy lại 11_website.sql rồi 09_grants.sql: giữ đơn, giữ quyền': async (ctx) => {
      const count = await ctx.value('select count(*)::int from website.registration_requests')
      await ctx.exec(readSql('supabase/v3/11_website.sql'))
      await ctx.exec(readSql('supabase/v3/09_grants.sql'))
      assert.equal(await ctx.value('select count(*)::int from website.registration_requests'), count)
      assert.ok((await submit(ctx, form())).id)
      assert.ok((await ctx.manager.rpc('list_registration_requests', { p_status: null })).length > 0)
    },
  },
}
