// Script riêng của phần Trang chủ (src/pages/index.astro): câu hỏi vì sao, con số chạy. JavaScript thuần, không thư
// viện. Hiện dần khi cuộn, nút liên hệ nổi, thanh tab sáng theo phần đang xem dùng chung cho mọi trang:
// src/scripts/page-effects.js, src/scripts/scroll-spy.js (nạp ở layouts/Base.astro).
// Mọi phần đều chạy được khi thiếu JavaScript: nội dung đã có sẵn trong HTML, script chỉ thêm tương tác.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ===== Câu hỏi vì sao hôm nay =====
// Hiện ngẫu nhiên 1 câu; "Câu khác" lần lượt đi hết các câu theo thứ tự xáo trộn rồi mới lặp lại.
function setupWhy() {
  const root = document.querySelector('[data-why]')
  if (!root) return
  const items = [...root.querySelectorAll('[data-why-item]')]
  const list = root.querySelector('[data-why-list]')
  const toggle = root.querySelector('[data-why-toggle]')
  const next = root.querySelector('[data-why-next]')
  if (items.length === 0 || !toggle) return

  let current = items.findIndex((item) => !item.hidden)
  let bag = []

  const answerOf = (index) => items[index].querySelector('[data-why-answer]')

  function setOpen(open) {
    answerOf(current).hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    toggle.querySelector('[data-when-closed]').hidden = open
    toggle.querySelector('[data-when-open]').hidden = !open
  }

  function show(index) {
    setOpen(false)
    items[current].hidden = true
    items[index].hidden = false
    current = index
    toggle.setAttribute('aria-controls', answerOf(index).id)
  }

  function nextIndex() {
    if (bag.length === 0) {
      bag = items.map((_, i) => i).filter((i) => i !== current)
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
    }
    return bag.pop()
  }

  show(Math.floor(Math.random() * items.length))
  // Đọc câu mới cho trình đọc màn hình khi bấm "Câu khác" (đặt sau lần chọn đầu để không đọc lúc tải trang).
  list.setAttribute('aria-live', 'polite')

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))
  next?.addEventListener('click', () => show(nextIndex()))
}

// ===== Con số chạy dần lên khi cuộn tới =====
// Số thật đã có sẵn trong HTML; chỉ chạy hiệu ứng với số còn ở dưới màn hình lúc tải trang.
function setupCountUp() {
  const numbers = [...document.querySelectorAll('[data-count-to]')]
  if (numbers.length === 0 || reduceMotion || !('IntersectionObserver' in window)) return
  const format = (n) => n.toLocaleString('vi-VN')
  function run(element) {
    const target = Number(element.dataset.countTo)
    const start = performance.now()
    const duration = 1400
    function frame(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      element.textContent = format(Math.round(target * eased))
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        run(entry.target)
      }
    },
    { threshold: 0.6 },
  )
  for (const element of numbers) {
    if (!Number.isFinite(Number(element.dataset.countTo))) continue
    if (element.getBoundingClientRect().top < window.innerHeight) continue
    element.textContent = format(0)
    observer.observe(element)
  }
}

setupWhy()
setupCountUp()
