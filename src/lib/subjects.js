// Danh sách môn học của Trung tâm (hiển thị có dấu trong ô chọn).
// Thêm môn mới: thêm một dòng vào đây. Mã không dấu trong tên lớp tự sinh từ chữ có dấu.
export const SUBJECTS = ['Toán', 'Văn', 'Anh', 'Vật Lí', 'Hóa học', 'Khoa học tự nhiên', 'Sinh Học']

// Khối lớp: 1 đến 12
export const GRADES = Array.from({ length: 12 }, (_, index) => index + 1)
