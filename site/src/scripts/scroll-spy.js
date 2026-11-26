// Trang chủ một trang (src/pages/index.astro): thanh tab (đáy điện thoại, ngang máy tính) sáng mục của phần đang xem;
// bấm liên kết tới một chỗ trên cùng trang thì cuộn mượt tới đó. JavaScript thuần, nạp ở layouts/Base.astro. Trang không
// có phần nào ([data-spy-section], src/components/parts/Part.astro) thì không làm gì; thiếu JavaScript thì liên kết /#id
// vẫn nhảy tới đúng phần.
// - Phần đang xem: phần cuối cùng có mép trên đã lên quá vạch ở 35% màn hình (tính dưới thanh tiêu đề); cuộn hết trang
//   thì là phần cuối.
// - Bấm một mục: mục đó sáng ngay, không nhấp nháy qua các phần ở giữa trong lúc trang đang cuộn tới.
// - Lịch học, form tải xong làm trang dài thêm: trang giữ chỗ cần tới ở đúng vị trí (mở thẳng /#dang-ky, bấm mục lúc
//   lịch chưa tải xong) cho tới khi người dùng tự cuộn hoặc chạm vào trang.

const sections = [...document.querySelectorAll('[data-spy-section]')]
const links = [...document.querySelectorAll('[data-spy-link]')]
const header = document.querySelector('body > header')
const main = document.querySelector('main')

// Vạch xác định phần đang xem, tính theo phần màn hình dưới thanh tiêu đề.
const LINE = 0.35
// Người dùng tự cuộn/chạm/gõ phím thì thôi giữ vị trí và thôi giữ mục đang sáng.
const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']
// Giữ mục vừa bấm sáng tối đa chừng này mili giây nếu vì lý do gì trang chưa tới được chỗ cần tới.
const LOCK_MAX = 3000

let current = links.find((link) => link.getAttribute('aria-current') === 'true')?.dataset.spyLink ?? null
let lockedTo = null
let lockTarget = null
let lockUntil = 0
let lockTimer = 0
let queued = false
let unpin = null

function setActive(id) {
  if (id === current) return
  current = id
  for (const link of links) {
    if (link.dataset.spyLink === id) link.setAttribute('aria-current', 'true')
    else link.removeAttribute('aria-current')
  }
}

function sectionInView() {
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
  const line = top + (window.innerHeight - top) * LINE
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
  if (atBottom) return sections[sections.length - 1].id
  let id = sections[0].id
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= line) id = section.id
  }
  return id
}

function update() {
  queued = false
  if (!lockedTo) setActive(sectionInView())
}

function schedule() {
  if (queued) return
  queued = true
  requestAnimationFrame(update)
}

// Đang cuộn tới chỗ vừa bấm: giữ mục đó sáng tới khi trang đã tới nơi (hết cuộn 150ms, hoặc sự kiện scrollend) thì
// tính lại theo vị trí. Chưa tới nơi (trang đổi chiều cao giữa chừng nên phải cuộn tiếp) thì giữ tiếp, tối đa LOCK_MAX;
// người dùng tự cuộn/chạm thì thôi giữ ngay.
function unlock() {
  clearTimeout(lockTimer)
  lockedTo = null
  lockTarget = null
  schedule()
}
function settle() {
  if (!lockedTo) return
  if (lockTarget && offTarget(lockTarget) && performance.now() < lockUntil) {
    clearTimeout(lockTimer)
    lockTimer = setTimeout(settle, 150)
    return
  }
  unlock()
}
function lock(id, target) {
  lockedTo = id
  lockTarget = target
  lockUntil = performance.now() + LOCK_MAX
  setActive(id)
  clearTimeout(lockTimer)
  lockTimer = setTimeout(settle, 400)
}

// Phần đầu tiên (Trang chủ) thì về hẳn đầu trang; chỗ khác thì đưa mép trên xuống dưới thanh tiêu đề (scroll-margin).
function scrollToTarget(target, behavior) {
  const options = behavior ? { behavior } : {}
  try {
    if (target === sections[0]) window.scrollTo({ top: 0, ...options })
    else target.scrollIntoView({ block: 'start', ...options })
  } catch {
    target.scrollIntoView({ block: 'start' })
  }
}

// Mép trên của target đang lệch chỗ cần tới (dưới thanh tiêu đề) mà trang còn cuộn tới được.
function offTarget(target) {
  if (target === sections[0]) return window.scrollY > 0
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0
  const top = target.getBoundingClientRect().top
  const canScroll = top > margin ? window.scrollY < document.documentElement.scrollHeight - window.innerHeight - 1 : true
  return Math.abs(top - margin) > 1 && canScroll
}

// Giữ target ở đầu màn hình khi trang đổi chiều cao (lịch học, form, khung tra cứu điểm tải xong: phía trên dài thêm
// đẩy target xuống, hoặc phía dưới dài thêm nên cuộn được tới target mà lúc bấm chưa tới được), trong ms mili giây hoặc
// tới khi người dùng tự thao tác. behavior không truyền: cuộn theo CSS (mượt, trừ khi chọn giảm chuyển động).
function pin(target, behavior, ms) {
  unpin?.()
  if (!main || !('ResizeObserver' in window)) return
  const observer = new ResizeObserver(() => {
    if (offTarget(target)) scrollToTarget(target, behavior)
  })
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    for (const type of USER_EVENTS) window.removeEventListener(type, stop)
    if (unpin === stop) unpin = null
  }
  const timer = setTimeout(stop, ms)
  for (const type of USER_EVENTS) window.addEventListener(type, stop, { passive: true })
  observer.observe(main)
  unpin = stop
}

function targetOf(hash) {
  if (!hash || hash === '#') return null
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)))
  } catch {
    return null
  }
}

function jump(target, href) {
  const section = target.closest('[data-spy-section]')
  if (section) lock(section.id, target)
  if (href !== window.location.href) history.pushState(null, '', href)
  scrollToTarget(target)
  // Đưa vị trí bấm Tab tiếp theo tới chỗ vừa nhảy tới (như liên kết #id bình thường).
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  pin(target, undefined, 4000)
}

function setup() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!link || link.target) return
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return
    const target = targetOf(url.hash)
    if (!target) return
    event.preventDefault()
    jump(target, url.href)
  })

  window.addEventListener(
    'scroll',
    () => {
      if (lockedTo) {
        clearTimeout(lockTimer)
        lockTimer = setTimeout(settle, 150)
      }
      schedule()
    },
    { passive: true },
  )
  window.addEventListener('scrollend', settle)
  for (const type of USER_EVENTS) {
    window.addEventListener(
      type,
      () => {
        if (lockedTo) unlock()
      },
      { passive: true },
    )
  }
  window.addEventListener('resize', schedule)
  document.addEventListener('layout-changed', schedule)
  if (main && 'ResizeObserver' in window) new ResizeObserver(schedule).observe(main)

  // Mở thẳng một phần (/#dang-ky, địa chỉ cũ /dang-ky chuyển về): giữ phần đó ở đầu màn hình trong lúc lịch học, form
  // tải xong. Tải lại trang hay bấm Quay lại thì trình duyệt tự đưa về chỗ cũ, không giữ.
  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  const target = targetOf(window.location.hash)
  if (target && (!navigation || navigation.type === 'navigate')) pin(target, 'instant', 10000)

  schedule()
}

if (sections.length > 0 && links.length > 0) setup()
