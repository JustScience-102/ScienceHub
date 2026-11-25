// Script của trang chủ (src/pages/index.astro). JavaScript thuần, không thư viện.
// Mọi phần đều chạy được khi thiếu JavaScript: nội dung đã có sẵn trong HTML, script chỉ thêm tương tác.
import { api } from '../lib/api.js'
import { buildSections, daysText, sectionDays, sharedTeacher, subjectStyle } from '../lib/catalog.js'
import { CLASS_SUBJECTS } from '../data/center.js'

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

// ===== Các lớp đang mở (lấy từ /api/lop-hoc như trang Lớp học & học phí) =====
// Mỗi môn một thẻ, mỗi khối một dòng. Lỗi tải thì bỏ khung xem trước, chỉ còn nút sang trang Lớp học.
async function setupSchedulePreview() {
  const box = document.querySelector('[data-schedule]')
  const cardTemplate = document.getElementById('mau-the-mon')
  const rowTemplate = document.getElementById('mau-dong-khoi')
  if (!box || !cardTemplate || !rowTemplate) return

  let data
  try {
    data = await api('/api/lop-hoc')
  } catch {
    box.remove()
    return
  }
  const sections = buildSections(data?.classes ?? [], CLASS_SUBJECTS)
  if (sections.length === 0) {
    box.remove()
    const empty = document.querySelector('[data-schedule-empty]')
    if (empty) empty.hidden = false
    return
  }

  const bySubject = new Map()
  for (const section of sections) {
    if (!bySubject.has(section.subject)) bySubject.set(section.subject, [])
    bySubject.get(section.subject).push(section)
  }
  const cards = []
  for (const [subject, list] of bySubject) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true)
    const style = subjectStyle(subject)
    card.querySelector('[data-bar]').classList.add(...style.bar.split(' '))
    const tag = card.querySelector('[data-tag]')
    tag.textContent = subject
    tag.classList.add(...style.tag.split(' '))
    const rows = card.querySelector('[data-rows]')
    for (const section of list) {
      const row = rowTemplate.content.firstElementChild.cloneNode(true)
      row.querySelector('[data-link]').href = `/dang-ky?mon=${encodeURIComponent(section.subject)}&khoi=${section.grade}`
      const grade = row.querySelector('[data-grade]')
      grade.textContent = `Lớp ${section.grade}`
      const hidden = document.createElement('span')
      hidden.className = 'sr-only'
      hidden.textContent = ` môn ${section.subject}`
      grade.append(hidden)
      const days = daysText(sectionDays(section, data.today))
      row.querySelector('[data-days]').textContent = days ? `Có ca học: ${days}` : 'Xem lịch ở trang Lớp học'
      const teacher = sharedTeacher(section)
      const teacherLine = row.querySelector('[data-teacher]')
      if (teacher) teacherLine.textContent = `Giáo viên: ${teacher}`
      else teacherLine.remove()
      rows.append(row)
    }
    cards.push(card)
  }
  box.replaceChildren(...cards)
  box.removeAttribute('aria-busy')
  document.dispatchEvent(new Event('schedule-preview-ready'))
}

// ===== Nút liên hệ nổi (điện thoại) =====
// Hiện khi đã cuộn qua phần đầu trang; ẩn khi phần Liên hệ hoặc chân trang đang hiện (ở đó đã có nút gọi/Zalo),
// và tạm ẩn mỗi khi nằm đè lên một nút hay liên kết khác của trang để không che nút đó.
function setupFloatingContact() {
  const floating = document.querySelector('[data-floating-contact]')
  if (!floating) return
  const setShown = (show) => {
    floating.classList.toggle('invisible', !show)
    floating.classList.toggle('opacity-0', !show)
    floating.classList.toggle('translate-y-3', !show)
  }
  const hero = document.querySelector('#tieu-de-trang')?.closest('section')
  const watched = [hero, document.querySelector('#lien-he'), document.querySelector('footer')].filter(Boolean)
  if (!('IntersectionObserver' in window) || watched.length === 0) {
    setShown(true)
    return
  }

  const visible = new Map()
  const GAP = 8
  function coversClickable() {
    const box = floating.getBoundingClientRect()
    if (box.width === 0) return false
    const targets = document.querySelectorAll('main a[href], main button, main summary, main input, main select')
    for (const element of targets) {
      if (floating.contains(element)) continue
      const r = element.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > box.left - GAP && r.left < box.right + GAP && r.bottom > box.top - GAP && r.top < box.bottom + GAP) {
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
  document.addEventListener('schedule-preview-ready', schedule)
}

setupWhy()
setupReveal()
setupCountUp()
setupFloatingContact()
setupSchedulePreview()
