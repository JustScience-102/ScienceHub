// Kiểm thử các hàm JS thuần của frontend (không cần trình duyệt, không cần Supabase).
// Chạy: node scripts/test-js.mjs
// Mã nguồn src/ import không có đuôi file (kiểu Vite), nên đăng ký bộ phân giải thêm ".js" cho Node.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.js`, context)
      } catch {
        // không phải file .js: để Node tự xử lý
      }
    }
    return nextResolve(specifier, context)
  },
})

const schedule = await import('../src/lib/schedule.js')
const { remainingSessions } = await import('../src/lib/tuition.js')
const { fetchAll } = await import('../src/lib/fetchAll.js')
const classGroups = await import('../src/lib/classGroups.js')
const homework = await import('../src/lib/homework.js')
const { subjectColor } = await import('../src/lib/dashboard.js')
const { SUBJECTS } = await import('../src/lib/subjects.js')
const parentLookup = await import('../site/src/lib/parentLookup.js')
const catalog = await import('../site/src/lib/catalog.js')
const siteCenter = await import('../site/src/data/center.js')
const siteWhy = await import('../site/src/data/cau-hoi-vi-sao.js')
const siteHome = await import('../site/src/data/trang-chu.js')
const lopHoc = await import('../site/api/lop-hoc.js')
const siteDb = await import('../site/server/db.js')
const dangKy = await import('../site/api/dang-ky.js')
const reg = await import('../site/src/lib/registration.js')
const registrations = await import('../src/lib/registrations.js')

let passed = 0
let failed = 0
async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  ✗ ${name}\n      ${String(error.message).split('\n').slice(0, 6).join('\n      ')}`)
  }
}

// Lịch đổi từ 2026-10-15: trước đó học Thứ 2 (2), từ đó học Thứ 4 (4).
const periods = [
  { day_of_week: 2, start_time: '17:30:00', end_time: '19:00:00', valid_from: null, valid_to: '2026-10-14' },
  { day_of_week: 4, start_time: '18:00:00', end_time: '19:30:00', valid_from: '2026-10-15', valid_to: null },
]

console.log('\n▶ Lịch theo thời kỳ (src/lib/schedule.js)')
await test('Ngày trước khi đổi lịch theo lịch cũ, sau khi đổi theo lịch mới', () => {
  assert.equal(schedule.hasSessionOn(periods, '2026-10-12'), true) // Thứ 2, lịch cũ
  assert.equal(schedule.hasSessionOn(periods, '2026-10-19'), false) // Thứ 2 sau ngày đổi
  assert.equal(schedule.hasSessionOn(periods, '2026-10-14'), false) // Thứ 4 trước ngày đổi
  assert.equal(schedule.hasSessionOn(periods, '2026-10-21'), true) // Thứ 4, lịch mới
})
await test('Lùi/tiến buổi học vượt qua ngày đổi lịch', () => {
  assert.equal(schedule.findSessionDate(periods, '2026-10-21', -1), '2026-10-12')
  assert.equal(schedule.findSessionDate(periods, '2026-10-12', 1), '2026-10-21')
  assert.equal(schedule.latestSessionDate(periods, '2026-10-20'), '2026-10-12')
})
await test('Hiển thị lịch đang áp dụng và báo lịch mới sắp áp dụng', () => {
  assert.equal(schedule.formatScheduleRows(schedule.displaySchedules(periods, '2026-10-01')), 'T2 · 17:30–19:00')
  assert.equal(schedule.formatScheduleRows(schedule.displaySchedules(periods, '2026-10-20')), 'T4 · 18:00–19:30')
  assert.equal(schedule.upcomingScheduleFrom(periods, '2026-10-01'), '2026-10-15')
  assert.equal(schedule.upcomingScheduleFrom(periods, '2026-10-20'), '')
})
await test('Dòng lịch không có thời kỳ (dữ liệu cũ) luôn có hiệu lực', () => {
  const rows = [{ day_of_week: 2, start_time: '08:00', end_time: '09:00' }]
  assert.equal(schedule.hasSessionOn(rows, '2026-10-12'), true)
  assert.equal(schedule.formatSchedule(rows), 'T2 · 08:00–09:00')
})

console.log('\n▶ Số buổi còn lại theo lịch (src/lib/tuition.js)')
await test('Đếm buổi còn lại theo lịch hiệu lực của từng ngày', () => {
  const enrollments = [{ class_id: 'c1', joined_at: '2026-10-01', classes: { class_schedules: periods } }]
  // Tháng 10/2026 tính từ 01/10: Thứ 2 ngày 5, 12 (lịch cũ) + Thứ 4 ngày 21, 28 (lịch mới) = 4
  const result = remainingSessions(enrollments, [], '2026-10-01', { year: 2026, month: 10 })
  assert.deepEqual(result, { c1: 4 })
  const withRecord = remainingSessions(enrollments, [{ class_id: 'c1', attendance_date: '2026-10-12' }], '2026-10-01', {
    year: 2026,
    month: 10,
  })
  assert.deepEqual(withRecord, { c1: 3 })
})

console.log('\n▶ Tải theo trang (src/lib/fetchAll.js)')
function fakeTable(total, { failAt = -1 } = {}) {
  const calls = []
  const build = () => {
    const state = { order: null, from: 0, to: 0 }
    const query = {
      order(column, options) {
        state.order = [column, options?.ascending]
        return query
      },
      range(from, to) {
        state.from = from
        state.to = to
        calls.push({ ...state })
        if (failAt === from) return Promise.resolve({ data: null, error: { message: 'boom' } })
        const rows = []
        for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ id: i })
        return Promise.resolve({ data: rows, error: null })
      },
    }
    return query
  }
  return { build, calls }
}
await test('Lấy đủ 2500 dòng (Supabase chỉ trả 1000 dòng mỗi lần)', async () => {
  const table = fakeTable(2500)
  const { data, error } = await fetchAll(table.build)
  assert.equal(error, null)
  assert.equal(data.length, 2500)
  assert.equal(new Set(data.map((row) => row.id)).size, 2500)
  assert.equal(table.calls.length, 3)
  assert.deepEqual(table.calls[0].order, ['id', true])
})
await test('Đúng 1000 dòng: gọi thêm 1 trang rỗng rồi dừng', async () => {
  const table = fakeTable(1000)
  const { data } = await fetchAll(table.build)
  assert.equal(data.length, 1000)
  assert.equal(table.calls.length, 2)
})
await test('Lỗi ở trang sau: trả lỗi, không trả dữ liệu thiếu', async () => {
  const table = fakeTable(2500, { failAt: 1000 })
  const { data, error } = await fetchAll(table.build)
  assert.equal(data, null)
  assert.equal(error.message, 'boom')
})
await test('Sắp theo cột khác khi bảng không có id', async () => {
  const table = fakeTable(10)
  await fetchAll(table.build, { orderBy: 'user_id' })
  assert.deepEqual(table.calls[0].order, ['user_id', true])
})

console.log('\n▶ Nhóm lớp (src/lib/classGroups.js)')
await test('Xếp lớp theo phần; phần trống hoặc dưới 2 lớp thì báo lỗi', () => {
  const { parts } = classGroups.partsFromAssignment({ a: 1, b: 1, c: 2, d: 2 }, 2)
  assert.deepEqual(parts, [['a', 'b'], ['c', 'd']])
  assert.match(classGroups.partsFromAssignment({ a: 1, b: 1 }, 2).error, /Phần 2 chưa có lớp/)
  assert.match(classGroups.partsFromAssignment({ a: 1 }, 1).error, /ít nhất hai lớp/)
  // Lớp gán vào phần đã bớt bị bỏ qua
  assert.deepEqual(classGroups.partsFromAssignment({ a: 1, b: 1, c: 3 }, 1).parts, [['a', 'b']])
})
await test('Mở form sửa từ nhóm đã lưu; tên nhóm của lớp đã thuộc nhóm khác', () => {
  const group = {
    id: 'g1',
    name: 'Vật Lí 12',
    parts: [
      { part_no: 1, classes: [{ id: 'a' }, { id: 'b' }] },
      { part_no: 2, classes: [{ id: 'c' }] },
    ],
  }
  assert.deepEqual(classGroups.assignmentFromGroup(group), { assignment: { a: 1, b: 1, c: 2 }, partCount: 2 })
  assert.equal(classGroups.classGroupNames([group]).get('c'), 'Vật Lí 12')
  assert.equal(classGroups.classGroupNames([group], 'g1').size, 0)
  assert.equal(classGroups.groupIsBalanced({ incomplete: [], overlaps: [] }), true)
  assert.equal(classGroups.groupIsBalanced({ incomplete: [{}], overlaps: [] }), false)
})
await test('Lịch sử làm bài tập (ScienceHub): chữ hiển thị và tóm tắt', () => {
  const lop = { kind: 'class', score10: '8.50', attempts: 1 }
  const thap = {
    kind: 'tower',
    floors_total: 3,
    floors_passed: 2,
    floors: [
      { floor: 1, score10: 9, passed: true, attempts: 1 },
      { floor: 3, score10: null, passed: false, attempts: 0 },
    ],
  }
  assert.equal(homework.resultLabel(lop), '8,5 điểm')
  assert.equal(homework.kindLabel(lop), 'Bài tại lớp')
  assert.equal(homework.resultLabel(thap), 'Qua 2/3 tầng')
  assert.equal(homework.kindLabel(thap), 'Tháp 3 tầng')
  assert.equal(homework.floorLabel(thap.floors[0]), 'Tầng 1: 9 điểm, đã qua (1 lượt)')
  assert.equal(homework.floorLabel(thap.floors[1]), 'Tầng 3: chưa làm')
  assert.deepEqual(homework.summarizeHomework([lop, { kind: 'class', score10: 7 }, thap]), {
    total: 3,
    classCount: 2,
    classAverage: 7.75,
    towerCount: 1,
    towersDone: 0,
  })
  assert.equal(homework.formatScore(null), '—')
})

console.log('\n▶ Màu môn học (src/lib/dashboard.js)')
await test('Mỗi môn trong danh sách có màu riêng, không trùng nhau', () => {
  const colors = SUBJECTS.map((subject) => subjectColor(subject))
  assert.equal(new Set(colors).size, SUBJECTS.length, colors.join(' | '))
  assert.equal(subjectColor('Ngữ văn'), subjectColor('Văn'))
  assert.equal(subjectColor('Tiếng Anh'), subjectColor('Anh'))
})

console.log('\n▶ Trang giới thiệu: tra cứu điểm (site/src/lib/parentLookup.js)')
await test('Điểm viết dấu phẩy, ngày theo giờ Việt Nam, tên môn như app trung tâm', () => {
  assert.equal(parentLookup.scoreText(7.5), '7,5')
  assert.equal(parentLookup.scoreText(6.25), '6,25')
  assert.equal(parentLookup.scoreText(8), '8')
  assert.equal(parentLookup.scoreText(6.666666), '6,67')
  // 23/11 lúc 18:30 giờ UTC là 01:30 sáng 24/11 ở Việt Nam.
  assert.equal(parentLookup.vnDate('2026-11-23T18:30:00Z'), '24/11/2026')
  for (const name of Object.values(parentLookup.SUBJECT_NAMES)) assert.ok(SUBJECTS.includes(name), name)
})

console.log('\n▶ Trang giới thiệu: lịch học các lớp (site/src/lib/catalog.js, site/api/lop-hoc.js)')
const TODAY = '2026-11-25'
const cls = (id, subject, grade, classNo, group, schedules) => ({
  id, subject, grade, class_no: classNo, teacher: 'Nguyễn Hải Nam', group, schedules,
})
const row = (day, start, end, from = null, to = null) => ({ day, start, end, from, to })
const G = 'g-li12'
const SAMPLE = [
  cls('li4', 'Vật Lí', 12, 4, { id: G, name: 'Vật Lí 12', part: 2 }, [row(6, '18:00', '20:00')]),
  cls('hoa', 'Hóa học', 11, 1, null, [row(7, '08:00', '10:00'), row(4, '17:30', '19:30')]),
  cls('li1', 'Vật Lí', 12, 1, { id: G, name: 'Vật Lí 12', part: 1 }, [row(2, '18:00', '20:00')]),
  cls('li3', 'Vật Lí', 12, 3, { id: G, name: 'Vật Lí 12', part: 2 }, [row(3, '18:00', '20:00')]),
  cls('li2', 'Vật Lí', 12, 2, { id: G, name: 'Vật Lí 12', part: 1 }, [row(5, '18:00', '20:00')]),
  cls('li10', 'Vật Lí', 10, 1, null, [row(3, '17:00', '19:00')]),
]
await test('Gom theo môn + khối (Vật Lí trước Hóa học, khối tăng dần); nhóm lớp chia theo phần', () => {
  const sections = catalog.buildSections(SAMPLE, siteCenter.CLASS_SUBJECTS)
  assert.deepEqual(sections.map((s) => `${s.subject} ${s.grade}`), ['Vật Lí 10', 'Vật Lí 12', 'Hóa học 11'])
  const li12 = sections[1]
  assert.equal(li12.singles.length, 0)
  assert.equal(li12.groups.length, 1)
  assert.deepEqual(li12.groups[0].parts.map((p) => [p.part, p.classes.map((c) => c.id)]), [
    [1, ['li1', 'li2']],
    [2, ['li3', 'li4']],
  ])
  assert.deepEqual(sections[2].singles.map((c) => c.id), ['hoa'])
  assert.equal(catalog.classLabel(SAMPLE[0]), 'Nhóm 4')
})
await test('Lịch đang áp dụng hôm nay và lịch mới sắp áp dụng; chữ hiển thị', () => {
  const rows = [
    row(7, '08:00', '10:00', null, '2026-12-01'),
    row(4, '17:30', '19:30', null, '2026-12-01'),
    row(6, '18:00', '20:00', '2026-12-02'),
    row(2, '18:00', '20:00', '2027-01-05'),
  ]
  const { current, upcoming } = catalog.splitSchedule(rows, TODAY)
  assert.deepEqual(current.map((r) => r.day), [4, 7], 'xếp theo thứ trong tuần')
  assert.equal(upcoming.from, '2026-12-02', 'chỉ lấy lịch mới gần nhất')
  assert.deepEqual(upcoming.rows.map((r) => r.day), [6])
  assert.equal(catalog.splitSchedule([row(2, '18:00', '20:00')], TODAY).upcoming, null)
  assert.equal(catalog.sessionText(row(8, '07:30', '09:30')), 'Chủ nhật · 07:30 – 09:30')
  assert.equal(catalog.vnDateText('2026-12-02'), '02/12/2026')
  for (const subject of siteCenter.CLASS_SUBJECTS) {
    assert.ok(SUBJECTS.includes(subject), `môn "${subject}" phải có trong app quản lý`)
    assert.ok(!subject.includes('|'), 'api/lop-hoc.js gửi danh sách môn ngăn cách bằng "|"')
  }
})
await test('Ví dụ cách chọn lịch theo phần (lịch Vật Lí 10 thật): đủ 4 cách đúng, 1 cách sai cùng phần', () => {
  const G10 = { id: 'g10', name: 'Vật Lí 10' }
  const li10 = [
    cls('n1', 'Vật Lí', 10, 1, { ...G10, part: 1 }, [row(2, '17:00', '19:00')]),
    cls('n2', 'Vật Lí', 10, 2, { ...G10, part: 1 }, [row(3, '14:30', '16:30')]),
    cls('n3', 'Vật Lí', 10, 3, { ...G10, part: 2 }, [row(5, '17:00', '19:00')]),
    cls('n4', 'Vật Lí', 10, 4, { ...G10, part: 2 }, [row(6, '14:30', '16:30')]),
  ]
  const [section] = catalog.buildSections(li10, siteCenter.CLASS_SUBJECTS)
  const r = catalog.partCombos(section.groups[0], TODAY)
  assert.deepEqual(r.combos, ['Thứ 2 + Thứ 5', 'Thứ 2 + Thứ 6', 'Thứ 3 + Thứ 5', 'Thứ 3 + Thứ 6'])
  assert.equal(r.total, 4)
  assert.deepEqual(r.wrongExample, { label: 'Thứ 2 + Thứ 3', part: 1 })
  assert.equal(catalog.sharedTeacher(section), 'Nguyễn Hải Nam')
})
await test('Cách chọn: bỏ cách trùng giờ; hai ca cùng phần trùng thứ thì ghi thêm giờ; phần chỉ 1 ca thì không có ví dụ sai', () => {
  const g = { id: 'g', name: 'Hóa học 12' }
  const list = [
    cls('a', 'Hóa học', 12, 1, { ...g, part: 1 }, [row(2, '17:00', '19:00')]),
    cls('b', 'Hóa học', 12, 2, { ...g, part: 1 }, [row(2, '19:30', '21:30')]),
    cls('c', 'Hóa học', 12, 3, { ...g, part: 2 }, [row(2, '18:00', '20:00')]),
  ]
  const [section] = catalog.buildSections(list, siteCenter.CLASS_SUBJECTS)
  const r = catalog.partCombos(section.groups[0], TODAY)
  assert.equal(r.total, 0, 'ca phần 2 (Thứ 2 18:00–20:00) trùng giờ cả hai ca phần 1')
  assert.deepEqual(r.wrongExample, { label: 'Thứ 2 (17:00) + Thứ 2 (19:30)', part: 1 })
  const onlyOne = catalog.buildSections([list[0], { ...list[2], schedules: [row(5, '18:00', '20:00')] }], [])[0]
  const r2 = catalog.partCombos(onlyOne.groups[0], TODAY)
  assert.deepEqual(r2.combos, ['Thứ 2 + Thứ 5'])
  assert.equal(r2.wrongExample, null)
  const mixed = catalog.buildSections([list[0], { ...list[1], teacher: 'Trần Thị Lan' }], [])[0]
  assert.equal(catalog.sharedTeacher(mixed), null, 'khác giáo viên thì ghi từng lớp')
})
await test('Trang chủ, "Các lớp đang mở": các thứ có ca học của một khối (chỉ lịch đang áp dụng)', () => {
  const sections = catalog.buildSections(
    [...SAMPLE, cls('li12b', 'Vật Lí', 12, 5, null, [row(8, '07:30', '09:30'), row(2, '19:00', '21:00', '2026-12-10')])],
    siteCenter.CLASS_SUBJECTS,
  )
  const li12 = sections.find((s) => s.subject === 'Vật Lí' && s.grade === 12)
  assert.deepEqual(catalog.sectionDays(li12, TODAY), [2, 3, 5, 6, 8], 'gồm cả lớp lẻ, bỏ lịch chưa áp dụng')
  assert.equal(catalog.daysText([2, 3, 5, 6, 8]), 'Thứ 2, 3, 5, 6, Chủ nhật')
  assert.equal(catalog.daysText([8]), 'Chủ nhật')
  assert.equal(catalog.daysText([4, 7]), 'Thứ 4, 7')
  assert.equal(catalog.daysText([]), '')
  assert.equal(catalog.subjectStyle('Hóa học').tag, 'bg-chem-100 text-chem-800', 'Hóa học màu cam')
  assert.equal(catalog.subjectStyle('VẬT LÍ').tag, 'bg-physics-100 text-physics-800', 'Vật Lí màu xanh dương')
})
await test('Trang chủ: câu hỏi "vì sao" đủ nội dung, đúng tên môn; con số/nhận xét chưa điền thì ẩn', () => {
  const questions = siteWhy.WHY_QUESTIONS
  assert.ok(questions.length >= 1)
  for (const q of questions) {
    assert.ok(siteCenter.CLASS_SUBJECTS.includes(q.mon), `câu "${q.cauHoi}": môn phải là ${siteCenter.CLASS_SUBJECTS.join(' hoặc ')}`)
    assert.ok(q.cauHoi?.trim() && q.loiGiai?.trim(), `câu "${q.cauHoi}" thiếu câu hỏi hoặc lời giải`)
  }
  assert.equal(new Set(questions.map((q) => q.cauHoi)).size, questions.length, 'không có câu hỏi trùng')
  assert.deepEqual(
    siteHome.filledStats([{ so: null, hauTo: '', nhan: 'năm' }, { so: 0, nhan: 'a' }, { so: 120, hauTo: '+', nhan: 'học sinh' }, { so: 5, nhan: ' ' }]),
    [{ so: 120, hauTo: '+', nhan: 'học sinh' }],
  )
  assert.deepEqual(
    siteHome.filledReviews([{ noiDung: 'Tốt', nguoiViet: '' }, { noiDung: ' ', nguoiViet: 'A' }, { noiDung: 'Hay', nguoiViet: 'Chị B' }]),
    [{ noiDung: 'Hay', nguoiViet: 'Chị B' }],
  )
  for (const item of siteHome.STATS) assert.ok(item.so === null || Number.isInteger(item.so), `con số "${item.nhan}" phải là số nguyên hoặc null`)
})
await test('Hàm máy chủ /api/lop-hoc: trả dữ liệu kèm bộ nhớ đệm; lỗi CSDL hoặc chưa cấu hình thì 503', async () => {
  const fakeRes = () => {
    const res = { headers: {}, code: 0, body: null }
    res.setHeader = (k, v) => { res.headers[k] = v }
    res.status = (c) => { res.code = c; return res }
    res.json = (b) => { res.body = b; return res }
    return res
  }
  let asked = null
  const ok = lopHoc.createHandler({ configured: () => true, query: async (subjects) => { asked = subjects; return { today: TODAY, classes: [] } } })
  const r1 = fakeRes()
  await ok({ method: 'GET' }, r1)
  assert.equal(r1.code, 200)
  assert.deepEqual(asked, siteCenter.CLASS_SUBJECTS)
  assert.match(r1.headers['Cache-Control'], /s-maxage=300/)
  const r2 = fakeRes()
  await lopHoc.createHandler({ configured: () => false, query: async () => ({}) })({ method: 'GET' }, r2)
  assert.equal(r2.code, 503)
  const r3 = fakeRes()
  const quiet = console.error
  console.error = () => {}
  try {
    await lopHoc.createHandler({ configured: () => true, query: async () => { throw new Error('mất kết nối') } })({ method: 'GET' }, r3)
  } finally {
    console.error = quiet
  }
  assert.equal(r3.code, 503)
  assert.equal(r3.headers['Cache-Control'], 'no-store', 'lỗi không được lưu đệm')
  assert.ok(!JSON.stringify(r3.body).includes('mất kết nối'), 'không lộ chi tiết lỗi')
  assert.equal(r3.body.code, 'Error', 'chỉ trả mã lỗi để dò')
  const r4 = fakeRes()
  await ok({ method: 'POST' }, r4)
  assert.equal(r4.code, 405)
})
await test('Kết nối CSDL bị đứt sau lúc nghỉ: bỏ kết nối cũ, thử lại một lần; lỗi lần hai thì báo lỗi', async () => {
  const quiet = console.warn
  console.warn = () => {}
  try {
    let calls = 0
    let resets = 0
    const flaky = siteDb.withRetry(async (x) => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' })
      return `ok ${x}`
    }, async () => { resets += 1 })
    assert.equal(await flaky('a'), 'ok a')
    assert.deepEqual([calls, resets], [2, 1])
    const broken = siteDb.withRetry(async () => { throw new Error('sai mật khẩu') }, async () => {})
    await assert.rejects(broken(), /sai mật khẩu/)
    // Ghi đơn: chỉ thử lại khi đứt kết nối; lỗi do CSDL trả (có SQLSTATE) thì không gửi lần hai.
    let writes = 0
    const write = siteDb.withRetry(async () => {
      writes += 1
      throw Object.assign(new Error('Môn Vật Lí: còn thiếu ca'), { code: 'P0001' })
    }, async () => {}, siteDb.isConnectionError)
    await assert.rejects(write(), /còn thiếu ca/)
    assert.equal(writes, 1)
    assert.equal(siteDb.isConnectionError({ code: 'ECONNRESET' }), true)
    assert.equal(siteDb.isConnectionError({ code: '22P02' }), false)
  } finally {
    console.warn = quiet
  }
})

console.log('\n▶ App quản lý: trang Đơn đăng ký (src/lib/registrations.js)')
await test('Gom lựa chọn theo môn + khối, thứ tự phần; giờ Việt Nam; đếm theo trạng thái', () => {
  const choices = [
    { class_id: 'b', subject: 'Vật Lí', grade: 12, class_no: 3, part: 2, schedule: [{ day: 3, start: '19:30', end: '21:30' }] },
    { class_id: 'a', subject: 'Vật Lí', grade: 12, class_no: 1, part: 1, schedule: [{ day: 3, start: '17:00', end: '19:00' }] },
    { class_id: 'c', subject: 'Hóa học', grade: 12, class_no: 1, part: null, schedule: [] },
  ]
  const groups = registrations.groupChoices(choices)
  assert.deepEqual(groups.map((g) => g.title), ['Vật Lí 12', 'Hóa học 12'])
  assert.deepEqual(groups[0].items.map((i) => i.label), ['Nhóm 1 · Phần 1', 'Nhóm 3 · Phần 2'])
  assert.equal(groups[0].items[0].text, 'Thứ 3 17:00–19:00')
  assert.equal(groups[1].items[0].text, 'chưa có lịch')
  assert.equal(registrations.formatDateTime('2026-11-25T07:05:00Z'), '25/11/2026 14:05')
  assert.deepEqual(registrations.countByStatus([{ status: 'new' }, { status: 'new' }, { status: 'enrolled' }]), {
    all: 3, new: 2, contacted: 0, enrolled: 1, cancelled: 0,
  })
  assert.equal(registrations.statusInfo('contacted').label, 'Đã liên hệ')
})

console.log('\n▶ Trang giới thiệu: form đăng ký học (site/src/lib/registration.js, site/api/dang-ky.js)')
const GOOD_FORM = {
  ...reg.EMPTY_FORM,
  student_name: '  Trần   Thị Bình ',
  grade: '12',
  parent_name: 'Trần Văn Hà',
  parent_phone: '+84 901 000 031',
  referrer_code: ' hs0001 ',
  consent: true,
}
await test('Kiểm tra ô nhập: hợp lệ; thiếu tên, SĐT sai, mã giới thiệu sai dạng, chưa đồng ý', () => {
  assert.deepEqual(reg.validateFields(GOOD_FORM), {})
  const bad = reg.validateFields({ ...reg.EMPTY_FORM, student_phone: '123', referrer_code: 'AB12', parent_phone: '0912' })
  assert.deepEqual(Object.keys(bad), ['student_name', 'grade', 'student_phone', 'parent_name', 'parent_phone', 'referrer_code', 'consent'])
  assert.equal(reg.normalizePhone('0912.345.678'), '0912345678')
  assert.equal(reg.normalizePhone('84912345678'), '0912345678')
  assert.equal(reg.normalizePhone('091234567'), null)
  const payload = reg.buildPayload(GOOD_FORM, ['a', 'b', 'a'])
  assert.deepEqual(payload, {
    student_name: 'Trần Thị Bình', grade: 12, school: '', student_phone: '', parent_name: 'Trần Văn Hà',
    parent_phone: '0901000031', referrer_code: 'HS0001', note: '', class_ids: ['a', 'b'],
  })
})
await test('Chọn lịch theo phần: chọn sẵn phần chỉ có 1 ca; thiếu phần thì báo; đủ phần thì lấy đúng lớp', () => {
  const g = { id: 'g', name: 'Hóa học 10' }
  const list = [
    cls('h1', 'Hóa học', 10, 1, { ...g, part: 1 }, [row(4, '14:30', '16:30')]),
    cls('h2', 'Hóa học', 10, 2, { ...g, part: 1 }, [row(5, '19:30', '21:30')]),
    cls('h3', 'Hóa học', 10, 3, { ...g, part: 2 }, [row(8, '19:30', '21:30')]),
  ]
  const [section] = catalog.buildSections(list, [])
  const pick = reg.defaultPick(section)
  assert.deepEqual(pick, { option: 'group:g', parts: { 2: 'h3' } }, 'phần 2 chỉ có 1 ca nên chọn sẵn')
  assert.match(reg.pickError(section, pick), /chọn 1 ca của Phần 1/)
  const full = { ...pick, parts: { ...pick.parts, 1: 'h2' } }
  assert.equal(reg.pickError(section, full), '')
  assert.deepEqual(reg.pickedClasses(section, full).map((c) => c.id), ['h2', 'h3'])
  const [single] = catalog.buildSections([cls('s', 'Hóa học', 11, 1, null, [row(2, '19:30', '21:30')])], [])
  assert.deepEqual(reg.pickedClasses(single, reg.defaultPick(single)).map((c) => c.id), ['s'])
  assert.equal(reg.pickError(section, { option: null, parts: {} }), 'Vui lòng chọn lịch học cho môn này.')
})
await test('Báo trùng giờ giữa hai môn', () => {
  const a = cls('a', 'Vật Lí', 12, 1, null, [row(2, '17:00', '19:00')])
  const b = cls('b', 'Hóa học', 12, 1, null, [row(2, '18:30', '20:30')])
  const c = cls('c', 'Hóa học', 12, 2, null, [row(2, '19:00', '21:00')])
  assert.match(reg.overlapError([a, b], TODAY), /trùng giờ: Thứ 2 17:00 \(Vật Lí\) và Thứ 2 18:30 \(Hóa học\)/)
  assert.equal(reg.overlapError([a, c], TODAY), '', 'nối tiếp giờ 19:00 không tính là trùng')
})
await test('Hàm máy chủ /api/dang-ky: kiểm tra, ô bẫy, chuyển câu lỗi của CSDL, mã IP một chiều', async () => {
  const fakeRes = () => {
    const res = { headers: {}, code: 0, body: null }
    res.setHeader = (k, v) => { res.headers[k] = v }
    res.status = (c) => { res.code = c; return res }
    res.json = (b) => { res.body = b; return res }
    return res
  }
  const calls = []
  const handler = dangKy.createHandler({
    configured: () => true,
    secret: () => 'bi-mat',
    submit: async (payload, hash) => {
      calls.push({ payload, hash })
      if (payload.student_name === 'Lỗi CSDL') throw Object.assign(new Error('Môn Vật Lí: còn thiếu ca của Phần 2.'), { code: 'P0001' })
      if (payload.student_name === 'Mất mạng') throw Object.assign(new Error('connect ETIMEDOUT 1.2.3.4'), { code: 'ETIMEDOUT' })
      return { id: 'id-1', updated: false }
    },
  })
  const req = (body) => ({ method: 'POST', body, headers: { 'x-forwarded-for': '113.1.2.3, 10.0.0.1' } })
  const r1 = fakeRes()
  await handler(req({ ...GOOD_FORM, class_ids: ['c1', 'c2'] }), r1)
  assert.equal(r1.code, 200)
  assert.deepEqual(r1.body, { ok: true, id: 'id-1', updated: false })
  assert.equal(r1.headers['Cache-Control'], 'no-store')
  assert.equal(calls[0].payload.parent_phone, '0901000031')
  assert.equal(calls[0].hash, dangKy.ipHash('113.1.2.3', 'bi-mat'))
  assert.equal(calls[0].hash.length, 32)
  assert.ok(!JSON.stringify(calls[0]).includes('113.1.2.3'), 'không gửi IP thật xuống CSDL')
  const r2 = fakeRes()
  await handler(req({ ...GOOD_FORM, class_ids: ['c1'], website: 'http://spam' }), r2)
  assert.equal(r2.code, 200, 'ô bẫy: trả thành công')
  assert.equal(calls.length, 1, 'ô bẫy: không ghi')
  const r3 = fakeRes()
  await handler(req({ ...GOOD_FORM, parent_phone: '123', class_ids: ['c1'] }), r3)
  assert.equal(r3.code, 400)
  assert.match(r3.body.error, /Số điện thoại phụ huynh/)
  const r4 = fakeRes()
  await handler(req({ ...GOOD_FORM, class_ids: [] }), r4)
  assert.match(r4.body.error, /ít nhất một môn/)
  const r5 = fakeRes()
  await handler(req({ ...GOOD_FORM, student_name: 'Lỗi CSDL', class_ids: ['c1'] }), r5)
  assert.equal(r5.code, 400)
  assert.equal(r5.body.error, 'Môn Vật Lí: còn thiếu ca của Phần 2.')
  const r6 = fakeRes()
  const quiet = console.error
  console.error = () => {}
  try {
    await handler(req({ ...GOOD_FORM, student_name: 'Mất mạng', class_ids: ['c1'] }), r6)
  } finally {
    console.error = quiet
  }
  assert.equal(r6.code, 503)
  assert.ok(!r6.body.error.includes('1.2.3.4'), 'không lộ chi tiết lỗi kết nối')
  const r7 = fakeRes()
  await handler({ method: 'POST', body: '{hỏng', headers: {} }, r7)
  assert.equal(r7.code, 400)
  const r8 = fakeRes()
  await handler({ method: 'GET', headers: {} }, r8)
  assert.equal(r8.code, 405)
})

console.log(`\n${passed} đạt, ${failed} lỗi`)
process.exit(failed > 0 ? 1 : 0)
