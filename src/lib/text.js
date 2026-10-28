// Hàm hỗ trợ xử lý chữ tiếng Việt.

// Bỏ dấu và chữ hoa để tìm kiếm: "Nguyễn Đức" -> "nguyen duc"
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

// Sắp xếp theo tên gọi (từ cuối của họ tên), đúng thói quen người Việt.
export function compareVietnameseNames(a, b) {
  const lastWord = (name) => String(name ?? '').trim().split(/\s+/).pop()
  return (
    lastWord(a).localeCompare(lastWord(b), 'vi') ||
    String(a ?? '').localeCompare(String(b ?? ''), 'vi')
  )
}
