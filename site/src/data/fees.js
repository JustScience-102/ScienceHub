// Học phí: ScienceHub cộng tác với Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy; mức học phí do Trung tâm quy định,
// phụ huynh đóng cho quản lý của Trung tâm. Chép theo tờ "Quy định thu học phí" của Trung tâm (người dùng gửi 25/11/2026);
// Trung tâm đổi quy định thì sửa ở đây. Học phí trên web KHÔNG lấy theo đơn giá/buổi trong app quản lý.
export const PARTNER = {
  name: 'Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy',
  phone: '0973765752',
  phoneShown: '0973 765 752',
}

export const FEE_TABLE = [
  {
    classes: 'Các lớp môn Toán, Văn, Anh, Lý, Hóa, Sinh',
    schedule: '2 buổi/tuần',
    sessions: '8 buổi/tháng',
    fee: '600.000đ/tháng',
  },
  {
    classes: 'Các lớp Khoa học tự nhiên cấp 2 (Hóa, Lý, Sinh)',
    schedule: '1 buổi/tuần',
    sessions: '4 – 5 buổi/tháng',
    fee: '75.000đ/buổi',
  },
]

export const FEE_RULES = [
  'Học sinh nghỉ học vì việc cá nhân: không trừ học phí.',
  'Học sinh nghỉ ốm phải nhập viện: được trừ học phí.',
  'Lớp 2 buổi/tuần: tháng nào có 9 đến 10 buổi, Trung tâm không tăng học phí.',
  'Học sinh nghỉ buổi nào, giáo viên hỗ trợ lại kiến thức buổi đó hoặc các em đến học bù.',
]
