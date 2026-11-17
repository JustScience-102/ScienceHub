// Lịch sử làm bài tập từ app giao bài ScienceHub (bảng sciencehub.results, RPC student_homework_history).
// Hàm thuần: chữ hiển thị cho từng bài và phần tóm tắt đầu tab. Điểm thang 10, dấu phẩy thập phân.

export function formatScore(value) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Math.round(Number(value) * 100) / 100
  return String(n).replace('.', ',')
}

// "Bài tại lớp" | "Tháp 3 tầng"
export function kindLabel(row) {
  return row.kind === 'tower' ? `Tháp ${row.floors_total ?? ''} tầng`.replace('  ', ' ') : 'Bài tại lớp'
}

// Kết quả chính của một bài: bài tại lớp ghi điểm, tháp ghi số tầng đã qua.
export function resultLabel(row) {
  if (row.kind === 'tower') return `Qua ${row.floors_passed ?? 0}/${row.floors_total ?? 0} tầng`
  return `${formatScore(row.score10)} điểm`
}

// Từng tầng của tháp: "Tầng 1: 9 điểm, đã qua (1 lượt)" · tầng chưa làm: "Tầng 3: chưa làm".
export function floorLabel(floor) {
  if (floor.score10 === null || floor.score10 === undefined) return `Tầng ${floor.floor}: chưa làm`
  return `Tầng ${floor.floor}: ${formatScore(floor.score10)} điểm, ${floor.passed ? 'đã qua' : 'chưa qua'} (${floor.attempts} lượt)`
}

// Tóm tắt đầu tab: số bài, điểm trung bình các bài tại lớp, số tháp đã qua hết các tầng.
export function summarizeHomework(rows) {
  const classRows = rows.filter((row) => row.kind === 'class' && row.score10 !== null && row.score10 !== undefined)
  const towers = rows.filter((row) => row.kind === 'tower')
  const average = classRows.length ? classRows.reduce((sum, row) => sum + Number(row.score10), 0) / classRows.length : null
  return {
    total: rows.length,
    classCount: classRows.length,
    classAverage: average === null ? null : Math.round(average * 100) / 100,
    towerCount: towers.length,
    towersDone: towers.filter((row) => row.floors_total && row.floors_passed >= row.floors_total).length,
  }
}
