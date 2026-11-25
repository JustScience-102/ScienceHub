// NỘI DUNG TRANG CHỦ (sciencehub.id.vn). Sửa ở đây, push lên main là web cập nhật.
// Thông tin liên hệ, địa chỉ, giờ làm việc vẫn ở src/data/center.js; câu hỏi "vì sao" ở src/data/cau-hoi-vi-sao.js.
//
// NGUYÊN TẮC: chỉ điền số liệu và nhận xét THẬT. Mục nào để trống (null, '' hoặc danh sách rỗng) thì web tự ẩn,
// không hiện chữ "đang cập nhật" hay số giả.

// ===== 1. CON SỐ =====
// Mỗi dòng một con số. Điền số thật vào "so" (ví dụ so: 5). Để so: null thì dòng đó không hiện;
// cả 4 dòng đều null thì cả dải con số bị ẩn. Có thể sửa chữ "nhan" hoặc thêm/bớt dòng.
//   so:    số nguyên, không có dấu chấm (1250, không viết 1.250; web tự thêm dấu chấm)
//   hauTo: chữ ngay sau số, ví dụ '+' hoặc '%' (không cần thì để '')
//   nhan:  dòng chữ nhỏ dưới số
export const STATS = [
  { so: null, hauTo: '', nhan: 'năm giảng dạy' },
  { so: null, hauTo: '+', nhan: 'học sinh đã theo học' },
  { so: null, hauTo: '+', nhan: 'bài tập đã chấm trên app' },
  { so: null, hauTo: '', nhan: 'học sinh đạt giải học sinh giỏi' },
]

// ===== 2. NHẬN XÉT CỦA PHỤ HUYNH / HỌC SINH =====
// Danh sách đang rỗng nên phần nhận xét đang ẩn. Thêm nhận xét THẬT (nên xin phép người viết) theo mẫu:
//   {
//     noiDung: 'Nội dung nhận xét, chép đúng lời phụ huynh hoặc học sinh.',
//     nguoiViet: 'Chị Lan',
//     vaiTro: 'Phụ huynh em Minh, lớp 11',
//   },
// Nên có 2–3 nhận xét. Thiếu nội dung hoặc người viết thì nhận xét đó không hiện.
export const REVIEWS = []

// ===== 3. ẢNH LỚP HỌC =====
// Ảnh nằm ở thư mục site/src/assets/anh/. Muốn thay ảnh: chép ảnh thật đè lên file cùng tên
// (ảnh .jpg chụp bằng điện thoại là được, web tự thu nhỏ và nén khi build). Tên file khác thì sửa "file" bên dưới.
// File không tồn tại thì ảnh đó không hiện; không còn ảnh nào thì cả phần ảnh bị ẩn.
//   moTa: mô tả ảnh cho người dùng trình đọc màn hình; chuThich: chữ hiện ở góc ảnh (để '' nếu không cần)
export const PHOTOS = [
  { file: 'lop-hoc-1.jpg', moTa: 'Phòng học của Lớp học ScienceHub', chuThich: 'Phòng học' },
  { file: 'lop-hoc-2.jpg', moTa: 'Thầy đang giảng bài trên bảng', chuThich: 'Thầy giảng bài' },
  { file: 'lop-hoc-3.jpg', moTa: 'Học sinh đang làm bài tập trên lớp', chuThich: 'Học sinh làm bài' },
  { file: 'lop-hoc-4.jpg', moTa: 'Học sinh làm thí nghiệm trên lớp', chuThich: 'Giờ thí nghiệm' },
]

// Ảnh chụp màn hình app làm bài tập, đặt trong khung điện thoại (cùng thư mục ảnh).
// Nên chụp dọc trên điện thoại (tỉ lệ khoảng 9:19), ví dụ màn hình kết quả có điểm và lời giải câu sai.
export const APP_SCREENSHOT = {
  file: 'app-dien-thoai.png',
  moTa: 'Màn hình app làm bài tập của ScienceHub trên điện thoại',
}

// ===== 4. "SCIENCEHUB PHÙ HỢP VỚI AI?" =====
export const FIT = {
  phuHop: [
    'Sẵn sàng cố gắng, kể cả khi gặp bài khó',
    'Chịu khó làm bài tập đầy đủ, đúng hạn',
    'Muốn hiểu bản chất, thích hỏi “vì sao” thay vì học thuộc',
  ],
  chuaPhuHop: [
    'Thường xuyên không làm bài tập',
    'Chưa chịu tập trung nghe giảng trên lớp',
    'Thiếu ý thức tự học, chỉ học khi có người nhắc',
  ],
}

// Chỉ giữ những con số / nhận xét đã điền đủ (dùng ở trang chủ).
export function filledStats(list = STATS) {
  return list.filter((item) => Number.isFinite(item?.so) && item.so > 0 && String(item.nhan ?? '').trim() !== '')
}

export function filledReviews(list = REVIEWS) {
  return list.filter(
    (item) => String(item?.noiDung ?? '').trim() !== '' && String(item?.nguoiViet ?? '').trim() !== '',
  )
}
