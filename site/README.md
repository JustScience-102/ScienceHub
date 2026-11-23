# Trang giới thiệu Trung tâm (sciencehub.id.vn)

Web công khai cho phụ huynh và học sinh: trang chủ, Lớp học & học phí, Quy định, Đăng ký học, Tra cứu điểm,
Chính sách bảo mật. Kế hoạch và các mốc: `ROADMAP.md` ở thư mục gốc; kiến trúc: `ARCHITECTURE.md` mục 5.

## Cấu trúc
- Astro 7 (trang HTML tĩnh) + React cho phần cần bấm (`client:load`) + Tailwind 4 + `lucide-react`, cùng phong cách
  app quản lý (nền slate-100, thẻ trắng viền slate-200, màu nhấn sky; nút chính sky-600 như app giao bài).
- `src/data/center.js`: thông tin Trung tâm (địa chỉ, giờ làm việc, SĐT, lời giới thiệu) và các tab. Ô để trống thì
  trang ghi "Đang cập nhật".
- `src/layouts/Base.astro`: khung chung (tab ngang trên máy tính từ 1024px, tab đáy trên điện thoại, chân trang).
- `src/pages/*.astro`: mỗi file một trang; build ra `ten-trang.html`, Vercel bật `cleanUrls` nên địa chỉ là `/ten-trang`.
- `src/components/ScoreLookup.jsx`: tab Tra cứu điểm (xem dưới).
- `public/`: logo "chữ S và quỹ đạo" chép từ app giao bài (`ScienceApp/app/web/public`).

## Tra cứu điểm
Giao diện viết lại từ trang `/phu-huynh` của app giao bài; dữ liệu và luật (mã HS + SĐT phụ huynh, khóa 15 phút
khi sai 5 lần, nhớ máy 90 ngày, chỉ bài Kiểm tra) do máy chủ ScienceApp xử lý. Web gọi `/api/diem/*`, được chuyển
tiếp sang `https://science-app-six.vercel.app/api/parent/*` (`vercel.json`; lúc chạy `npm run dev` là proxy trong
`astro.config.mjs`), nên cookie phiên `sh_parent` nằm trên tên miền của web. ScienceApp đổi API tra cứu thì sửa
`ScoreLookup.jsx` và `src/lib/parentLookup.js` theo.

## Bảo mật
CSP chế độ chặn: Astro tự thêm thẻ `<meta>` có mã băm cho script/style của từng trang (`security.csp` trong
`astro.config.mjs`); header trong `vercel.json` thêm `frame-ancestors`, `X-Frame-Options`... Không dùng công cụ
theo dõi hay quảng cáo.

## Lệnh (chạy trong thư mục `site/`)
- `npm install` (lần đầu), `npm run dev` (chạy thử, http://localhost:4321), `npm run build` (ra `site/dist/`).
- Ở thư mục gốc: `npm run build:site`; `npm run lint` và `npm test` của thư mục gốc đã gồm cả `site/`.

## Triển khai
Dự án Vercel riêng, nối cùng kho GitHub, **Root Directory = `site`** (Vercel tự nhận Astro). Mỗi lần push lên
`main` là web cập nhật. Tên miền `sciencehub.id.vn` và `www` gắn vào dự án này.
