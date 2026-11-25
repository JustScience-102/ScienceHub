# Trang giới thiệu Trung tâm (sciencehub.id.vn)

Web công khai cho phụ huynh và học sinh: trang chủ, Lớp học & học phí, Quy định, Đăng ký học, Tra cứu điểm,
Chính sách bảo mật. Kế hoạch và các mốc: `ROADMAP.md` ở thư mục gốc; kiến trúc: `ARCHITECTURE.md` mục 5.

## Cấu trúc
- Astro 7 (trang HTML tĩnh) + React cho phần cần bấm (`client:load`) + Tailwind 4 + `lucide-react` (+ `postgres` cho
  hàm máy chủ), cùng phong cách
  app quản lý (nền slate-100, thẻ trắng viền slate-200, màu nhấn xanh dương; nút chính brand-600 như app giao bài).
- **Màu của cả web** là biến trong `src/styles/global.css` (`@theme`): `brand` (xanh dương chính của logo, cùng giá trị
  bảng `sky` của Tailwind), `mint` (xanh lá của chấm tròn trên logo), `physics` (Vật Lí, xanh dương), `chem` (Hóa học,
  cam). Viết class theo tên biến (`bg-brand-600`, `text-mint-700`), không viết `sky-*`; nhãn môn lấy từ `subjectStyle`
  (`src/lib/catalog.js`). Đổi giá trị trong `@theme` là đổi mọi trang.
- `src/data/center.js`: thông tin Trung tâm (địa chỉ, giờ làm việc, SĐT) và các tab. Ô để trống thì
  trang ghi "Đang cập nhật".
- `src/layouts/Base.astro`: khung chung (tab ngang trên máy tính từ 1024px, tab đáy trên điện thoại, chân trang).
  `wide` bỏ khung giữa trang để trang tự chia dải nền tràn hết chiều ngang (chỉ trang chủ dùng).
- `src/pages/*.astro`: mỗi file một trang; build ra `ten-trang.html`, Vercel bật `cleanUrls` nên địa chỉ là `/ten-trang`.
- `src/components/ScoreLookup.jsx`: tab Tra cứu điểm (xem dưới).
- `public/`: logo "chữ S và quỹ đạo" chép từ app giao bài (`ScienceApp/app/web/public`).

## Trang chủ
- `src/pages/index.astro` ráp các phần ở `src/components/home/` theo thứ tự: `Hero` (họa tiết khoa học SVG trôi chậm),
  `WhyQuestion` (câu hỏi vì sao), `TechHighlights` (3 ô công nghệ + khung điện thoại), `SchedulePreview` (các lớp đang
  mở, lấy `/api/lop-hoc`; lỗi thì chỉ còn nút sang trang Lớp học), `ClassPhotos`, `StatsReviews`, `FitForWho`,
  `CallToAction` (Đăng ký + Liên hệ), `FloatingContact` (nút Zalo/Gọi nổi, chỉ dưới 1024px). Phần không có dữ liệu thì
  bỏ; nền các phần còn lại tự xen kẽ giấy kẻ ô / trắng / xanh rất nhạt.
- **Nội dung sửa được** (không cần đụng mã giao diện):
  - `src/data/cau-hoi-vi-sao.js`: các câu hỏi "vì sao". Thêm câu: chép một khối `{ mon, cauHoi, loiGiai }`, `mon` là
    `'Vật Lí'` hoặc `'Hóa học'` (test JS kiểm tra tên môn, câu trùng).
  - `src/data/trang-chu.js`: con số (`so: null` thì ẩn), nhận xét (danh sách rỗng thì ẩn), ảnh lớp học, ảnh màn hình
    app, danh sách "phù hợp / chưa phù hợp". **Chỉ điền số liệu và nhận xét thật.**
  - `src/assets/anh/`: ảnh (`lop-hoc-1.jpg` … `lop-hoc-4.jpg`, `app-dien-thoai.png`; hiện là ảnh giữ chỗ vẽ minh họa).
    Thay bằng ảnh thật cùng tên là xong: Astro (`astro:assets`, dùng `sharp` có sẵn trong Astro) tự thu nhỏ, đổi sang
    WebP nhiều cỡ, ảnh tải lười. File không có thì ảnh đó ẩn; tên file phân biệt hoa thường (`.jpg` khác `.JPG`).
- `src/scripts/home.js` (JS thuần, khoảng 8 KB cùng `catalog.js`): câu hỏi ngẫu nhiên + "Câu khác" (đi hết các câu
  rồi mới lặp), hiện dần khi cuộn tới (chỉ phần còn dưới màn hình lúc tải), số chạy dần lên, xem trước lịch học, nút nổi
  (ẩn ở phần đầu trang, phần Liên hệ, chân trang và khi đè lên nút/liên kết khác). `prefers-reduced-motion` tắt mọi
  chuyển động (CSS trong `global.css`). Không dùng thuộc tính `style=""` (CSP chặn); đổi giao diện bằng class.

## Lịch học các lớp (`/api/lop-hoc`)
- `api/lop-hoc.js`: hàm máy chủ Vercel (thư mục `api/` của dự án), gọi `website.catalog()` trong CSDL app quản lý
  bằng tài khoản `website_link` (`supabase/v3/11_website.sql`, `website_link.sql`). Biến môi trường
  `WEBSITE_DATABASE_URL` (chuỗi Transaction pooler, cổng 6543, người dùng `website_link.<mã project>`) đặt trong
  Settings → Environment Variables của dự án Vercel; thiếu biến thì trang báo "Chưa tải được lịch học".
- Kết quả lưu đệm 5 phút ở Vercel. `npm run dev` không chạy hàm này (trang báo lỗi tải lịch là bình thường).
- `src/lib/catalog.js` (gom theo môn + khối, theo phần của nhóm lớp, tách lịch đang áp dụng / lịch mới, các thứ có ca
  học cho trang chủ) và `src/components/ClassSchedule.jsx`. Chỉ lấy các môn trong `CLASS_SUBJECTS` (`src/data/center.js`).

## Đăng ký học (`/api/dang-ky`)
- `api/dang-ky.js`: nhận form, kiểm tra nhanh bằng `src/lib/registration.js` (cùng quy tắc với form), rồi gọi
  `website.submit_registration` (CSDL kiểm tra lại toàn bộ). Câu lỗi nhập liệu của CSDL trả nguyên cho phụ huynh.
  Ô bẫy `website` có chữ thì trả thành công mà không ghi. IP chỉ gửi dạng HMAC (khóa = `WEBSITE_DATABASE_URL`).
- `server/db.js`: kết nối dùng chung cho mọi hàm `api/*`. Không truyền mảng bằng `db.array()`, không ép `::jsonb` ở câu
  lệnh (lỗi lần gọi đầu, xem ghi chú trong file); ghi dữ liệu chỉ thử lại khi đứt kết nối.
- `src/components/RegistrationForm.jsx`: form 4 bước; `?mon=&khoi=` chọn sẵn môn + khối.

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
