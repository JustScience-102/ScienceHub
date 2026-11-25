// Form đăng ký học (trang Đăng ký học, mốc M3). Hàm thuần dùng cho cả form (trình duyệt) và hàm máy chủ
// site/api/dang-ky.js; CSDL (website.submit_registration, supabase/v3/11_website.sql) kiểm tra lại toàn bộ.
// Câu báo lỗi viết giống câu của CSDL. Test: scripts/test-js.mjs.
import { DAY_LABELS, splitSchedule } from './catalog.js'

export const EMPTY_FORM = {
  student_name: '',
  grade: '',
  school: '',
  student_phone: '',
  parent_name: '',
  parent_phone: '',
  referrer_code: '',
  note: '',
  consent: false,
  website: '', // ô bẫy chống spam: người thật không thấy, không điền
}

const collapse = (text) => String(text ?? '').trim().replace(/\s+/g, ' ')

// SĐT: bỏ dấu cách, chấm, gạch, ngoặc; +84/84 đầu số -> 0. Trả null khi không đúng 10 số bắt đầu bằng 0.
export function normalizePhone(raw) {
  let value = String(raw ?? '').replace(/[\s.()-]/g, '')
  value = value.replace(/^\+?84(\d{9})$/, '0$1')
  return /^0\d{9}$/.test(value) ? value : null
}

export function normalizeReferrer(raw) {
  return String(raw ?? '').replace(/\s/g, '').toUpperCase()
}

// Lỗi từng ô (rỗng = hợp lệ). Thứ tự khóa = thứ tự ô trên form.
export function validateFields(form) {
  const errors = {}
  const student = collapse(form.student_name)
  if (student.length < 2 || student.length > 100) errors.student_name = 'Vui lòng nhập họ tên của con (2 đến 100 ký tự).'
  const grade = Number(form.grade)
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) errors.grade = 'Vui lòng chọn khối lớp của con.'
  if (collapse(form.school).length > 150) errors.school = 'Tên trường tối đa 150 ký tự.'
  if (String(form.student_phone ?? '').trim() && !normalizePhone(form.student_phone)) {
    errors.student_phone = 'Số điện thoại của con cần đủ 10 chữ số, bắt đầu bằng 0; không có thì để trống.'
  }
  const parent = collapse(form.parent_name)
  if (parent.length < 2 || parent.length > 100) errors.parent_name = 'Vui lòng nhập họ tên phụ huynh (2 đến 100 ký tự).'
  if (!normalizePhone(form.parent_phone)) {
    errors.parent_phone = 'Số điện thoại phụ huynh cần đủ 10 chữ số, bắt đầu bằng 0 (ví dụ 0912345678).'
  }
  const referrer = normalizeReferrer(form.referrer_code)
  if (referrer && !/^HS\d{4,6}$/.test(referrer)) {
    errors.referrer_code = 'Mã học sinh giới thiệu có dạng HS và 4 chữ số, ví dụ HS0123; không có thì để trống.'
  }
  if (String(form.note ?? '').trim().length > 1000) errors.note = 'Ghi chú tối đa 1000 ký tự.'
  if (form.consent !== true) errors.consent = 'Vui lòng đánh dấu đồng ý để ScienceHub dùng thông tin liên hệ với phụ huynh.'
  return errors
}

// Các cách học một môn–khối (mục của buildSections): theo một nhóm lớp (mỗi phần chọn một ca) hoặc một lớp lẻ.
export function sectionOptions(section) {
  return [
    ...section.groups.map((group) => ({ key: `group:${group.id}`, type: 'group', group })),
    ...section.singles.map((cls) => ({ key: `single:${cls.id}`, type: 'single', cls })),
  ]
}

// Lựa chọn ban đầu khi phụ huynh đánh dấu một môn: chỉ có một cách học thì chọn sẵn; phần chỉ có 1 ca thì chọn sẵn.
export function defaultPick(section) {
  const options = sectionOptions(section)
  if (options.length !== 1) return { option: null, parts: {} }
  return withDefaultParts({ option: options[0].key, parts: {} }, options[0])
}

export function withDefaultParts(pick, option) {
  if (option?.type !== 'group') return { option: pick.option, parts: {} }
  const parts = { ...pick.parts }
  for (const part of option.group.parts) {
    if (part.classes.length === 1 && !parts[part.part]) parts[part.part] = part.classes[0].id
  }
  return { option: pick.option, parts }
}

const optionOf = (section, pick) => sectionOptions(section).find((o) => o.key === pick?.option) ?? null

// Các lớp đã chọn của một môn–khối.
export function pickedClasses(section, pick) {
  const option = optionOf(section, pick)
  if (!option) return []
  if (option.type === 'single') return [option.cls]
  return option.group.parts
    .map((part) => part.classes.find((cls) => cls.id === pick.parts?.[part.part]))
    .filter(Boolean)
}

// Lỗi lựa chọn lịch của một môn–khối (rỗng = đủ: lớp lẻ, hoặc đúng 1 ca mỗi phần).
export function pickError(section, pick) {
  const option = optionOf(section, pick)
  if (!option) return 'Vui lòng chọn lịch học cho môn này.'
  if (option.type === 'group') {
    const missing = option.group.parts.find((part) => !part.classes.some((cls) => cls.id === pick.parts?.[part.part]))
    if (missing) return `Vui lòng chọn 1 ca của Phần ${missing.part}. Mỗi tuần con học 1 ca ở mỗi phần.`
  }
  return ''
}

// Hai buổi trùng giờ giữa các lớp đã chọn (theo lịch đang áp dụng hôm nay); rỗng = không trùng.
export function overlapError(classes, today) {
  const sessions = classes.flatMap((cls) =>
    splitSchedule(cls.schedules ?? [], today).current.map((row) => ({ ...row, cls })),
  )
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i]
      const b = sessions[j]
      if (a.cls.id !== b.cls.id && a.day === b.day && a.start < b.end && b.start < a.end) {
        const at = (x) => `${DAY_LABELS[x.day]} ${x.start} (${x.cls.subject})`
        return `Hai ca bị trùng giờ: ${at(a)} và ${at(b)}. Phụ huynh vui lòng chọn ca khác.`
      }
    }
  }
  return ''
}

// Dữ liệu gửi lên /api/dang-ky.
export function buildPayload(form, classIds) {
  return {
    student_name: collapse(form.student_name),
    grade: Number(form.grade),
    school: collapse(form.school),
    student_phone: normalizePhone(form.student_phone) ?? '',
    parent_name: collapse(form.parent_name),
    parent_phone: normalizePhone(form.parent_phone) ?? '',
    referrer_code: normalizeReferrer(form.referrer_code),
    note: String(form.note ?? '').trim(),
    class_ids: [...new Set(classIds)],
  }
}
