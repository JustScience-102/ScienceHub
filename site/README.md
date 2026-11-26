# Trang giới thiệu Trung tâm (sciencehub.id.vn)

Web công khai cho phụ huynh và học sinh, dạng **một trang cuộn**: trang chủ lần lượt có 5 phần Trang chủ, Lớp học &
học phí, Quy định, Đăng ký học, Tra cứu điểm; riêng Chính sách bảo mật và 404 là trang riêng. Kế hoạch và các mốc:
`ROADMAP.md` ở thư mục gốc; kiến trúc: `ARCHITECTURE.md` mục 5.

## Cấu trúc
- Astro 7 (trang HTML tĩnh) + React cho phần cần bấm (`client:load` / `client:visible`) + Tailwind 4 + `lucide-react`
  (+ `postgres` cho hàm máy chủ), cùng phong cách app quản lý (nền slate-100, thẻ trắng viền slate-200, màu nhấn xanh
  dương; nút chính brand-600 như app giao bài).
- **Màu của cả web** là biến trong `src/styles/global.css` (`@theme`): `brand` (xanh dương chính của logo, cùng giá trị
  bảng `sky` của Tailwind), `mint` (xanh lá của chấm tròn trên logo), `physics` (Vật Lí, xanh dương), `chem` (Hóa học,
  cam). Viết class theo tên biến (`bg-brand-600`, `text-mint-700`), không viết `sky-*`; nhãn môn lấy từ `subjectStyle`
  (`src/lib/catalog.js`). Đổi giá trị trong `@theme` là đổi mọi trang.
- `src/data/center.js`: thông tin Trung tâm (địa chỉ, giờ làm việc, SĐT) và `NAV_ITEMS` (5 phần của trang chủ: id,
  tên). Ô để trống thì trang ghi "Đang cập nhật".
- `src/layouts/Base.astro`: khung chung (thanh ngang trên máy tính từ 1024px, thanh tab đáy trên điện thoại, chân trang
  có liên kết 2 cột trên điện thoại). Mục của hai thanh và chân trang là liên kết `/#id` tới các phần của trang chủ.
  `wide` bỏ khung giữa trang để trang tự chia dải nền tràn hết chiều ngang (mọi trang đang dùng). Nạp cho mọi trang:
  - `src/scripts/page-effects.js`: hiện dần khi cuộn tới (class `reveal`, chỉ phần còn dưới màn hình lúc tải) và nút
    liên hệ nổi.
  - `src/scripts/scroll-spy.js`: **mục của phần đang xem sáng lên** (`aria-current="true"`, kiểu chữ ở class
    `aria-[current=true]:` trong `Base.astro`; thanh đáy có thêm vạch xanh ở mép trên). Phần đang xem là phần cuối cùng
    có mép trên đã lên quá vạch 35% màn hình (dưới thanh tiêu đề); cuộn hết trang là phần cuối. Bấm liên kết tới một chỗ
    trên cùng trang (`/#id`, `#id`): sáng ngay mục đó và giữ trong lúc cuộn mượt (không nhấp nháy qua các phần ở giữa),
    ghi địa chỉ vào lịch sử (nút Quay lại về chỗ cũ), đưa tiêu điểm tới phần đó. Lịch học, form, khung tra cứu điểm tải
    xong làm trang dài thêm thì giữ chỗ cần tới ở đúng vị trí (cả khi mở thẳng `/#dang-ky`) cho tới khi người dùng tự
    cuộn/chạm. Trang không có phần nào (Bảo mật, 404) thì không làm gì.
- **Khối giao diện dùng chung** (`src/components/`):
  - `parts/Part.astro`: khung một phần của trang chủ (`id` trùng `NAV_ITEMS`, `data-spy-section`; `hideFloating` ẩn
    nút nổi ở phần có ô nhập). `PartHeader`: phần đầu các phần Lớp học, Quy định, Đăng ký (nền xanh nhạt, họa tiết
    khoa học mờ, ô biểu tượng, h2). `PageHero`: phần đầu trang riêng (Bảo mật, 404; h1). Họa tiết chung: `HeroPattern`.
  - `PageSection` (một dải nền `tone` white/tint/grid, `compact` cho dải trong các phần, `level` 2/3 cho cấp tiêu đề)
    + `SectionHeader` (dòng nhỏ, tiêu đề, câu giới thiệu). Cấp tiêu đề: h1 ở phần đầu trang chủ; h2 cho dải của phần
    Trang chủ và `PartHeader`; h3 cho dải trong một phần.
  - `FloatingContact`: nút Zalo/Gọi nổi, chỉ dưới 1024px. Hiện khi đã cuộn qua phần đầu trang (`data-page-top`), ẩn ở
    phần Đăng ký, Tra cứu điểm (`data-hide-floating`), chân trang và khi đè lên nút/liên kết/ô nhập khác.
  - `FeeInfo` (thẻ giá + thông tin Trung tâm + quy định thu học phí), `ContactList`.
  - `SectionRedirect`: trang chuyển hướng của địa chỉ cũ (xem dưới).
- `src/pages/`: `index.astro` (trang chủ một trang), `bao-mat.astro`, `404.astro`; build ra `ten-trang.html`, Vercel bật
  `cleanUrls` nên địa chỉ là `/ten-trang`. **Địa chỉ cũ** `lop-hoc.astro`, `quy-dinh.astro`, `dang-ky.astro`,
  `tra-cuu-diem.astro` (và `/phu-huynh` qua `vercel.json`) chỉ còn chuyển về phần tương ứng (`/#lop-hoc`...), giữ mục con
  (`/quy-dinh#noi-quy` → `/#noi-quy`) và `?mon=&khoi=`; chuyển bằng script vì máy chủ không thấy phần `#` của địa chỉ;
  `noindex`.
- `public/`: logo "chữ S và quỹ đạo" chép từ app giao bài (`ScienceApp/app/web/public`).

## Trang chủ một trang
`src/pages/index.astro` ráp 5 phần theo thứ tự (id trong ngoặc; giữ các id này vì thanh tab, địa chỉ cũ và liên kết
trong trang dùng):
1. **Trang chủ** (`#trang-chu`): các dải ở `src/components/home/`: `Hero` (h1, họa tiết khoa học SVG trôi chậm, nút
   Đăng ký học / Xem lịch học & học phí), `WhyQuestion` (câu hỏi vì sao), `TechHighlights` (3 ô công nghệ + khung điện
   thoại), `ClassPhotos`, `StatsReviews`, `FitForWho` ("phù hợp với ai?", chỉ có ở đây). Dải không có dữ liệu thì bỏ;
   nền các dải còn lại tự xen kẽ giấy kẻ ô / trắng / xanh rất nhạt.
2. **Lớp học & học phí** (`#lop-hoc`, `parts/Classes.astro`): dải Học phí `#hoc-phi` (`FeeInfo`: thẻ giá to, Trung tâm
   thu học phí, "Quy định thu học phí"); dải Lịch học `#lich-hoc` (`ClassSchedule.jsx`, `client:load`): thanh lọc
   môn/khối **dính dưới thanh tiêu đề** khi cuộn, mỗi hàng nút cuộn ngang, nút môn đang chọn mang màu môn
   (`subjectStyle().chip`); đổi bộ lọc lúc đã cuộn sâu thì đưa đầu danh sách về dưới thanh lọc; nút "Đăng ký lịch này"
   rộng hết ngang trên điện thoại.
3. **Quy định** (`#quy-dinh`, `parts/Rules.astro`): mỗi mục một dải `#noi-quy`, `#xin-nghi`, `#lich-theo-phan`; nút
   "Nhắn Zalo báo nghỉ cho thầy"; học phí buổi nghỉ trỏ về `#hoc-phi`.
4. **Đăng ký học** (`#dang-ky`, `parts/Register.astro`): form `RegistrationForm.jsx` (`client:visible`) trên nền giấy kẻ
   ô, thẻ "Cần tư vấn" (`#tu-van`).
5. **Tra cứu điểm** (`#tra-cuu-diem`, `parts/Scores.astro`): `ScoreLookup.jsx` (`client:visible`; khung có tiêu đề h2
   nên không có `PartHeader`) + dòng hỗ trợ nhắn Zalo.

- **Nội dung sửa được** (không cần đụng mã giao diện):
  - `src/data/cau-hoi-vi-sao.js`: các câu hỏi "vì sao". Thêm câu: chép một khối `{ mon, cauHoi, loiGiai }`, `mon` là
    `'Vật Lí'` hoặc `'Hóa học'` (test JS kiểm tra tên môn, câu trùng).
  - `src/data/trang-chu.js`: con số (`so: null` thì ẩn), nhận xét (danh sách rỗng thì ẩn), ảnh lớp học, ảnh màn hình
    app, danh sách "phù hợp / chưa phù hợp". **Chỉ điền số liệu và nhận xét thật.**
  - `src/assets/anh/`: ảnh (`lop-hoc-1.jpg` … `lop-hoc-4.jpg`, `app-dien-thoai.png`; hiện là ảnh giữ chỗ vẽ minh họa).
    Thay bằng ảnh thật cùng tên là xong: Astro (`astro:assets`, dùng `sharp` có sẵn trong Astro) tự thu nhỏ, đổi sang
    WebP nhiều cỡ, ảnh tải lười. File không có thì ảnh đó ẩn; tên file phân biệt hoa thường (`.jpg` khác `.JPG`).
- `src/scripts/home.js` (JS thuần): câu hỏi ngẫu nhiên + "Câu khác" (đi hết các câu rồi mới lặp), số chạy dần lên.
  `prefers-reduced-motion` tắt mọi chuyển động (CSS trong `global.css`; cuộn tới phần cũng nhảy ngay). Không dùng
  thuộc tính `style=""` (CSP chặn); đổi giao diện bằng class.
- **Tải nhanh trên điện thoại**: form đăng ký và khung tra cứu điểm chỉ dựng khi cuộn gần tới (`client:visible`, cách
  600px); khách chỉ xem trang chủ thì không hỏi máy chủ ScienceApp. Lịch học và form dùng chung một lần tải
  `/api/lop-hoc` (`loadCatalog` trong `src/lib/api.js`).
- **Chính sách bảo mật**, **404**: `PageHero` + thẻ có biểu tượng.

## Lịch học các lớp (`/api/lop-hoc`)
- `api/lop-hoc.js`: hàm máy chủ Vercel (thư mục `api/` của dự án), gọi `website.catalog()` trong CSDL app quản lý
  bằng tài khoản `website_link` (`supabase/v3/11_website.sql`, `website_link.sql`). Biến môi trường
  `WEBSITE_DATABASE_URL` (chuỗi Transaction pooler, cổng 6543, người dùng `website_link.<mã project>`) đặt trong
  Settings → Environment Variables của dự án Vercel; thiếu biến thì trang báo "Chưa tải được lịch học".
- Kết quả lưu đệm 5 phút ở Vercel. `npm run dev` không chạy hàm này (trang báo lỗi tải lịch là bình thường).
- `src/lib/catalog.js` (gom theo môn + khối, theo phần của nhóm lớp, tách lịch đang áp dụng / lịch mới) và
  `src/components/ClassSchedule.jsx`. Chỉ lấy các môn trong `CLASS_SUBJECTS` (`src/data/center.js`).

## Đăng ký học (`/api/dang-ky`)
- `api/dang-ky.js`: nhận form, kiểm tra nhanh bằng `src/lib/registration.js` (cùng quy tắc với form), rồi gọi
  `website.submit_registration` (CSDL kiểm tra lại toàn bộ). Câu lỗi nhập liệu của CSDL trả nguyên cho phụ huynh.
  Ô bẫy `website` có chữ thì trả thành công mà không ghi. IP chỉ gửi dạng HMAC (khóa = `WEBSITE_DATABASE_URL`).
- `server/db.js`: kết nối dùng chung cho mọi hàm `api/*`. Không truyền mảng bằng `db.array()`, không ép `::jsonb` ở câu
  lệnh (lỗi lần gọi đầu, xem ghi chú trong file); ghi dữ liệu chỉ thử lại khi đứt kết nối.
- `src/components/RegistrationForm.jsx`: form 4 bước; gửi xong thì cuộn về đầu khung "Đã gửi". Chọn sẵn môn + khối:
  - Nút "Đăng ký lịch này" (`ClassSchedule.jsx`) gọi `requestPick` (`src/lib/registerPick.js`), `scroll-spy.js` cuộn
    xuống `#dang-ky`, form chọn sẵn không tải lại trang: cùng khối với lựa chọn đang có thì thêm môn đó, khác khối thì
    đổi khối, đã gửi đơn thì mở form mới. Form chưa dựng thì lựa chọn được giữ chờ.
  - Địa chỉ `?mon=&khoi=` (liên kết của nút mở ở tab mới, địa chỉ cũ `/dang-ky?mon=&khoi=`).

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
