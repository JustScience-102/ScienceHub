// Thông tin Trung tâm hiển thị trên web. Sửa ở đây rồi push lên main là web cập nhật.
// Ô để trống ('') thì trang ghi "Đang cập nhật".
export const CENTER = {
  name: 'Trung tâm ScienceHub',
  slogan: 'Always ask why?',
  // Đoạn giới thiệu ở trang chủ: mỗi phần tử là một đoạn văn.
  intro: [],
  address: '',
  // Liên kết Google Maps (mở Google Maps, tìm địa chỉ, bấm Chia sẻ > Sao chép đường liên kết).
  mapUrl: '',
  hours: '',
  contactName: 'Thầy Nam ScienceHub',
  phone: '0866076800',
  phoneShown: '0866 076 800',
}

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
