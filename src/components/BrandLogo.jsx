// Logo "chữ S và quỹ đạo", dùng chung với app giao bài và trang giới thiệu sciencehub.id.vn.
// Ảnh public/icon-192.png chép từ app giao bài (kho ScienceApp, app/web/public); đổi logo thì chép lại cả ba nơi.
export default function BrandLogo({ className = 'h-9 w-9 rounded-lg' }) {
  return <img src="/icon-192.png" alt="" aria-hidden="true" className={className} />
}
