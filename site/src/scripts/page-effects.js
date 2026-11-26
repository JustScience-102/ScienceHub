// Hiệu ứng dùng chung cho mọi trang (nạp ở src/layouts/Base.astro). JavaScript thuần, không thư viện.
// Không có JavaScript thì mọi nội dung vẫn hiện bình thường.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ===== Hiện dần khi cuộn tới =====
// Chỉ ẩn những phần đang nằm dưới màn hình lúc tải trang (phần đang thấy không bị nháy).
function setupReveal() {
  const elements = [...document.querySelectorAll('.reveal')]
  if (reduceMotion || !('IntersectionObserver' in window)) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.remove('is-hidden')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  for (const element of elements) {
    if (element.getBoundingClientRect().top < window.innerHeight) continue
    element.classList.add('is-hidden')
    observer.observe(element)
  }
}

// ===== Nút liên hệ nổi (điện thoại) =====
// Trang nào cần thì đặt <FloatingContact />. Hiện khi đã cuộn qua phần đầu trang (data-page-top); ẩn khi đang xem
// phần có ô nhập (data-hide-floating: Đăng ký, Tra cứu điểm; phần Đăng ký đã có thẻ gọi/Zalo) hoặc chân trang, và tạm ẩn
// mỗi khi nằm đè lên một nút hay liên kết khác của trang để không che nút đó. Trang đổi bố cục sau khi tải (dữ liệu
// về) thì phát sự kiện 'layout-changed'.
function setupFloatingContact() {
  const floating = document.querySelector('[data-floating-contact]')
  if (!floating) return
  const setShown = (show) => {
    floating.classList.toggle('invisible', !show)
    floating.classList.toggle('opacity-0', !show)
    floating.classList.toggle('translate-y-3', !show)
  }
  const watched = [...document.querySelectorAll('[data-page-top], [data-hide-floating], body > footer')]
  if (!('IntersectionObserver' in window) || watched.length === 0) {
    setShown(true)
    return
  }

  const visible = new Map()
  // Khoảng chừa quanh nút; chiều dọc rộng hơn vì phần tử đang hiện dần còn trượt lên 18px (global.css .reveal).
  const GAP_X = 8
  const GAP_Y = 24
  function coversClickable() {
    const box = floating.getBoundingClientRect()
    if (box.width === 0) return false
    const targets = document.querySelectorAll('main a[href], main button, main summary, main input, main select')
    for (const element of targets) {
      if (floating.contains(element)) continue
      const r = element.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > box.left - GAP_X && r.left < box.right + GAP_X && r.bottom > box.top - GAP_Y && r.top < box.bottom + GAP_Y) {
        return true
      }
    }
    return false
  }
  let queued = false
  function update() {
    queued = false
    // Ở máy tính nút bị ẩn hẳn (lg:hidden), không cần tính.
    if (getComputedStyle(floating).display === 'none') return
    setShown(watched.every((element) => !visible.get(element)) && !coversClickable())
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) visible.set(entry.target, entry.isIntersecting)
    schedule()
  })
  for (const element of watched) observer.observe(element)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  // Phần tử vừa hiện dần xong (đã trượt vào chỗ) hoặc lịch học vừa tải xong cũng có thể nằm dưới nút.
  document.addEventListener('transitionend', schedule)
  document.addEventListener('layout-changed', schedule)
}

setupReveal()
setupFloatingContact()
