// Thông tin Lớp học ScienceHub hiển thị trên web. Sửa ở đây rồi push lên main là web cập nhật.
// Nội dung riêng của trang chủ (con số, nhận xét, ảnh, "phù hợp với ai") ở src/data/trang-chu.js.
// Ô để trống ('' hoặc []) thì trang ghi "Đang cập nhật".
// Danh xưng (người dùng chốt 25/11/2026): "Lớp học ScienceHub", trong câu gọi tắt "ScienceHub";
// chữ "Trung tâm" chỉ dùng cho Trung tâm gia sư Chìa Khóa Vàng (đối tác thu học phí, xem fees.js).
export const CENTER = {
  name: 'Lớp học ScienceHub',
  shortName: 'ScienceHub',
  slogan: 'Always ask why?',
  address: 'Số 10 Nguyễn Công Trứ, phường Bãi Cháy, thành phố Quảng Ninh',
  // Liên kết Google Maps (mở Google Maps, tìm địa chỉ, bấm Chia sẻ > Sao chép đường liên kết).
  mapUrl: 'https://maps.app.goo.gl/HGQPkzM1YHZHNr2h6',
  // Giờ làm việc: mỗi phần tử một dòng.
  hours: ['Thứ 2 – Thứ 7: 14:30 – 21:30', 'Chủ nhật: 7:30 – 21:30'],
  contactName: 'Thầy Nam ScienceHub',
  phone: '0866076800',
  phoneShown: '0866 076 800',
}

// Các môn của ScienceHub: trang "Lớp học & học phí" chỉ lấy lớp của các môn này từ app quản lý.
// Viết đúng như danh sách môn của app quản lý (src/lib/subjects.js).
export const CLASS_SUBJECTS = ['Vật Lí', 'Hóa học']

// App giao bài (ScienceApp). Tab Tra cứu điểm vẫn chuyển tiếp tới địa chỉ .vercel.app (vercel.json), không phụ thuộc DNS.
export const HOMEWORK_APP_URL = 'https://baitap.sciencehub.id.vn'

// Các tab của web: thanh ngang trên máy tính, thanh tab đáy trên điện thoại.
export const NAV_ITEMS = [
  { href: '/', label: 'Trang chủ', short: 'Trang chủ', icon: 'home' },
  { href: '/lop-hoc', label: 'Lớp học & học phí', short: 'Lớp học', icon: 'classes' },
  { href: '/quy-dinh', label: 'Quy định', short: 'Quy định', icon: 'rules' },
  { href: '/dang-ky', label: 'Đăng ký học', short: 'Đăng ký', icon: 'register' },
  { href: '/tra-cuu-diem', label: 'Tra cứu điểm', short: 'Xem điểm', icon: 'scores' },
]
