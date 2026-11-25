// Học phí: ScienceHub cộng tác với Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy; mức học phí do Trung tâm quy định,
// phụ huynh đóng cho quản lý của Trung tâm. Chép theo tờ "Quy định thu học phí" của Trung tâm (người dùng gửi 25/11/2026),
// chỉ giữ hai môn của ScienceHub (Vật Lí, Hóa học). Trung tâm đổi quy định thì sửa ở đây.
// Học phí trên web KHÔNG lấy theo đơn giá/buổi trong app quản lý.
export const PARTNER = {
  name: 'Trung tâm gia sư Chìa Khóa Vàng Bãi Cháy',
  // SĐT/Zalo của quản lý Trung tâm (người thu học phí), người dùng đồng ý công khai 25/11/2026.
  managerPhone: '0973765752',
  managerPhoneShown: '0973 765 752',
}

export const FEE_TABLE = [
  {
    classes: 'Các lớp Vật Lí, Hóa học',
    schedule: '2 buổi/tuần',
    sessions: '8 buổi/tháng',
    fee: '600.000đ/tháng',
  },
]

export const FEE_RULES = [
  'Học sinh nghỉ học vì việc cá nhân: không trừ học phí.',
  'Học sinh nghỉ ốm phải nhập viện: được trừ học phí.',
  'Tháng nào có 9 đến 10 buổi học, Trung tâm không tăng học phí.',
  'Học sinh nghỉ buổi nào, giáo viên hỗ trợ lại kiến thức buổi đó hoặc các em đến học bù.',
]
