// Ảnh của trang chủ trong src/assets/anh/ (tên file khai báo ở src/data/trang-chu.js). Astro tự thu nhỏ, nén sang
// WebP lúc build, nên chỉ cần chép ảnh gốc vào thư mục. File không có thì trả null (trang tự bỏ ảnh đó).
const FILES = import.meta.glob('../../assets/anh/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  import: 'default',
})

export function homeImage(fileName) {
  if (!fileName) return null
  return FILES[`../../assets/anh/${fileName}`] ?? null
}
