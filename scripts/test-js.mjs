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
const lopHoc = await import('../site/api/lop-hoc.js')

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
  for (const subject of siteCenter.CLASS_SUBJECTS) assert.ok(SUBJECTS.includes(subject), `môn "${subject}" phải có trong app quản lý`)
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
  const r4 = fakeRes()
  await ok({ method: 'POST' }, r4)
  assert.equal(r4.code, 405)
})

console.log(`\n${passed} đạt, ${failed} lỗi`)
process.exit(failed > 0 ? 1 : 0)
