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

console.log(`\n${passed} đạt, ${failed} lỗi`)
process.exit(failed > 0 ? 1 : 0)
