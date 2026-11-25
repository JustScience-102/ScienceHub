// Xử lý danh sách lớp từ /api/lop-hoc (website.catalog, supabase/v3/11_website.sql). Hàm thuần, có test ở
// scripts/test-js.mjs. Dữ liệu: { today: 'YYYY-MM-DD', classes: [{ id, subject, grade, class_no, teacher,
//   group: { id, name, part } | null, schedules: [{ day, start, end, from, to }] }] }

export const DAY_LABELS = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'Chủ nhật' }

// Màu môn trên web (biến physics/chem ở src/styles/global.css), dùng chung với tab Tra cứu điểm và trang chủ.
// chip: nút lọc môn đang chọn (nền đậm 700 để chữ trắng đủ tương phản).
const SUBJECT_STYLES = {
  'vật lí': { tag: 'bg-physics-100 text-physics-800', bar: 'bg-physics-500', chip: 'border-physics-700 bg-physics-700 text-white' },
  'hóa học': { tag: 'bg-chem-100 text-chem-800', bar: 'bg-chem-500', chip: 'border-chem-700 bg-chem-700 text-white' },
}
const DEFAULT_STYLE = { tag: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400', chip: 'border-brand-600 bg-brand-600 text-white' }

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

const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end

// Các cách chọn lịch hợp lệ của một nhóm lớp: mỗi phần đúng một ca (ca = một lớp, theo lịch đang áp dụng),
// bỏ các cách có hai buổi trùng giờ. Tên ca là thứ học ("Thứ 2"); hai ca cùng phần trùng thứ thì thêm giờ.
// Trả { combos: ['Thứ 2 + Thứ 5', ...], total, wrongExample: { label: 'Thứ 2 + Thứ 3', part: 1 } | null }
// (ví dụ sai: 2 ca của cùng một phần).
export function partCombos(group, today, limit = 8) {
  const parts = group.parts.map((part) => {
    const options = part.classes
      .map((cls) => ({ cls, rows: splitSchedule(cls.schedules ?? [], today).current }))
      .filter((option) => option.rows.length > 0)
    const dayText = (rows) => rows.map((r) => DAY_LABELS[r.day] ?? `Thứ ${r.day}`).join(', ')
    const counts = new Map()
    for (const option of options) counts.set(dayText(option.rows), (counts.get(dayText(option.rows)) ?? 0) + 1)
    for (const option of options) {
      const plain = dayText(option.rows)
      option.label = counts.get(plain) > 1 ? option.rows.map((r) => `${DAY_LABELS[r.day]} (${r.start})`).join(', ') : plain
    }
    return options
  })
  if (parts.some((options) => options.length === 0)) return { combos: [], total: 0, wrongExample: null }

  let picks = [[]]
  for (const options of parts) {
    picks = picks.flatMap((chosen) =>
      options
        .filter((option) => !chosen.some((c) => c.rows.some((r) => option.rows.some((o) => overlaps(r, o)))))
        .map((option) => [...chosen, option]),
    )
  }
  const crowded = parts.findIndex((options) => options.length >= 2)
  return {
    combos: picks.slice(0, limit).map((chosen) => chosen.map((c) => c.label).join(' + ')),
    total: picks.length,
    wrongExample:
      crowded === -1
        ? null
        : { label: `${parts[crowded][0].label} + ${parts[crowded][1].label}`, part: group.parts[crowded].part },
  }
}

// Mọi lớp trong mục cùng một giáo viên thì trả tên đó (hiện một lần ở đầu mục), khác nhau thì null.
export function sharedTeacher(section) {
  const all = [...section.singles, ...section.groups.flatMap((g) => g.parts.flatMap((p) => p.classes))]
  const names = new Set(all.map((c) => c.teacher ?? ''))
  return names.size === 1 && all[0]?.teacher ? all[0].teacher : null
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

// Các thứ có ca học (lịch đang áp dụng hôm nay) của mọi lớp trong một mục môn + khối, tăng dần: [2, 5, 8].
// Dùng cho phần "Các lớp đang mở" ở trang chủ.
export function sectionDays(section, today) {
  const all = [...section.singles, ...section.groups.flatMap((g) => g.parts.flatMap((p) => p.classes))]
  const days = new Set(all.flatMap((cls) => splitSchedule(cls.schedules ?? [], today).current.map((r) => r.day)))
  return [...days].sort((a, b) => a - b)
}

// [2, 3, 5, 8] -> "Thứ 2, 3, 5, Chủ nhật"; [8] -> "Chủ nhật"; [] -> "".
export function daysText(days) {
  const weekdays = days.filter((d) => d >= 2 && d <= 7)
  const parts = weekdays.length > 0 ? [`Thứ ${weekdays.join(', ')}`] : []
  if (days.includes(8)) parts.push('Chủ nhật')
  return parts.join(', ')
}
