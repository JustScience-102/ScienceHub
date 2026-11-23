// Tra cứu điểm cho phụ huynh: bản JS các hằng và hàm của app/shared/parentLookup.ts (kho ScienceApp).
// Máy chủ ScienceApp trả dữ liệu; đổi quy tắc bên đó (ví dụ MIN_CLASS_AVG) thì đổi theo ở đây.
//
// Dữ liệu GET /api/diem/view (null khi chưa đăng nhập):
//   { children: [{ code, name, items: [{ assignmentId, title, subject: 'VL' | 'HH' | null,
//     kind: 'class' | 'tower' | 'exam', doneAt, score10: number | null,
//     floors: { passed, total } | null, classAvg: { value, n } | null }] }] }

/** Lớp có dưới 5 em làm bài thì máy chủ không trả điểm trung bình lớp. */
export const MIN_CLASS_AVG = 5

/** Mã môn của app giao bài → tên môn viết như app quản lý trung tâm (src/lib/subjects.js). */
export const SUBJECT_NAMES = { VL: 'Vật Lí', HH: 'Hóa học' }

/** Điểm thang 10 viết kiểu Việt Nam: 6,25 · 7,5 · 8. */
export function scoreText(x) {
  return String(Math.round(x * 100) / 100).replace('.', ',')
}

/** Ngày DD/MM/YYYY theo giờ Việt Nam. */
export function vnDate(iso) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
