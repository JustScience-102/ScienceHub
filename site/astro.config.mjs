// Trang giới thiệu Trung tâm (sciencehub.id.vn). Trang tĩnh dựng bằng Astro; phần cần bấm (tra cứu điểm,
// form đăng ký) là component React như app quản lý. Xem site/README.md.
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// Máy chủ app giao bài: tab "Tra cứu điểm" gọi /api/diem/* và được chuyển tiếp sang /api/parent/* của app này
// (trên mạng: vercel.json; lúc chạy thử trên máy: proxy của Vite bên dưới).
const SCIENCE_APP = 'https://science-app-six.vercel.app'

export default defineConfig({
  site: 'https://sciencehub.id.vn',
  // "/lop-hoc" thay vì "/lop-hoc/": build ra lop-hoc.html, Vercel bật cleanUrls.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react()],
  // Web không có khối mã nguồn cần tô màu; tắt để không vướng CSP (Shiki dùng style nội tuyến).
  markdown: { syntaxHighlight: false },
  // CSP chế độ chặn: Astro tự thêm mã băm cho script/style của từng trang vào thẻ <meta>.
  // Các chỉ thị không đặt được bằng <meta> (frame-ancestors...) nằm ở header trong vercel.json.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api/diem': {
          target: SCIENCE_APP,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/diem/, '/api/parent'),
        },
      },
    },
  },
})
