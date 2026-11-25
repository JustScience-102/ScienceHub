// Xử lý danh sách lớp từ /api/lop-hoc (website.catalog, supabase/v3/11_website.sql). Hàm thuần, có test ở
// scripts/test-js.mjs. Dữ liệu: { today: 'YYYY-MM-DD', classes: [{ id, subject, grade, class_no, teacher,
//   group: { id, name, part } | null, schedules: [{ day, start, end, from, to }] }] }

export const DAY_LABELS = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'Chủ nhật' }

// Màu môn giống app quản lý (src/lib/dashboard.js) và tab Tra cứu điểm.
const SUBJECT_STYLES = {
  'vật lí': { tag: 'bg-sky-100 text-sky-800', bar: 'bg-sky-500' },
  'hóa học': { tag: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
}
const DEFAULT_STYLE = { tag: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400' }

export function subjectStyle(subject) {
  return SUBJECT_STYLES[String(subject ?? '').normalize('NFC').toLowerCase()] ?? DEFAULT_STYLE
}

export function vnDateText(iso) {
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

export function sessionText(row) {
  return `${DAY_LABELS[row.day] ?? `Thứ ${row.day}`} · ${row.start} – ${row.end}`
}

// "Nhóm 1" như tên thân thiện của app quản lý (classTitle: "Vật Lí 12 Nhóm 1"); "Lớp 12" để chỉ khối.
export function classLabel(cls) {
  return cls.class_no == null ? 'Nhóm' : `Nhóm ${cls.class_no}`
}

const bySession = (a, b) => a.day - b.day || a.start.localeCompare(b.start)

// Lịch của một lớp: các buổi đang áp dụng hôm nay và lịch mới gần nhất sắp áp dụng (nếu có).
export function splitSchedule(rows, today) {
  const current = rows
    .filter((r) => (r.from == null || r.from <= today) && (r.to == null || r.to >= today))
    .sort(bySession)
  const future = rows.filter((r) => r.from != null && r.from > today)
  if (future.length === 0) return { current, upcoming: null }
  const from = future.map((r) => r.from).sort()[0]
  return { current, upcoming: { from, rows: future.filter((r) => r.from === from).sort(bySession) } }
}

const byClassNo = (a, b) => (a.class_no ?? 999) - (b.class_no ?? 999)

// Gom lớp theo môn + khối. Mỗi mục: các nhóm lớp (mỗi nhóm chia theo phần, mỗi phần các ca để chọn một)
// và các lớp không thuộc nhóm. Môn xếp theo subjectOrder, khối tăng dần.
export function buildSections(classes, subjectOrder = []) {
  const order = subjectOrder.map((s) => s.normalize('NFC').toLowerCase())
  const subjectRank = (subject) => {
    const i = order.indexOf(String(subject).normalize('NFC').toLowerCase())
    return i === -1 ? order.length : i
  }
  const sections = new Map()
  for (const cls of classes) {
    const key = `${cls.subject}|${cls.grade}`
    if (!sections.has(key)) {
      sections.set(key, { key, subject: cls.subject, grade: cls.grade, groups: new Map(), singles: [] })
    }
    const section = sections.get(key)
    if (!cls.group) {
      section.singles.push(cls)
      continue
    }
    if (!section.groups.has(cls.group.id)) {
      section.groups.set(cls.group.id, { id: cls.group.id, name: cls.group.name, parts: new Map() })
    }
    const parts = section.groups.get(cls.group.id).parts
    if (!parts.has(cls.group.part)) parts.set(cls.group.part, [])
    parts.get(cls.group.part).push(cls)
  }
  return [...sections.values()]
    .map((section) => ({
      key: section.key,
      subject: section.subject,
      grade: section.grade,
      singles: section.singles.sort(byClassNo),
      groups: [...section.groups.values()]
        .map((group) => ({
          id: group.id,
          name: group.name,
          parts: [...group.parts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([part, list]) => ({ part, classes: list.sort(byClassNo) })),
        }))
        .sort((a, b) => byClassNo(a.parts[0].classes[0], b.parts[0].classes[0])),
    }))
    .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject) || a.subject.localeCompare(b.subject) || a.grade - b.grade)
}
