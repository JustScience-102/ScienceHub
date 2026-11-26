// Lịch học các lớp đang mở (phần Lớp học & học phí của trang chủ), lấy từ app quản lý qua /api/lop-hoc
// (site/api/lop-hoc.js; dùng chung một lần tải với form đăng ký, loadCatalog). Nút "Đăng ký" đưa xuống phần Đăng ký
// của cùng trang và chọn sẵn môn + khối trong form (src/lib/registerPick.js).
// Bố cục gọn cho điện thoại (người dùng chốt 26/11/2026): mỗi môn + khối một thẻ nhỏ, xếp theo khối rồi theo môn (máy
// tính 2 thẻ một hàng, mỗi hàng một khối). Nhóm lớp: mỗi phần một dòng "Phần 1 · chọn 1 trong 2 ca", các ca là ô nhỏ
// xếp ngang. Lớp lẻ: "học cả N buổi" (một lớp) hoặc "chọn 1 trong N lớp" (nhiều lớp, mỗi lớp ghi "Nhóm N").
// Câu giải thích lịch chia theo phần ghi một lần ở đầu lịch. Thanh lọc khối một hàng, dính dưới thanh tiêu đề.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarClock, Layers, Loader2, Phone } from 'lucide-react'
import { loadCatalog } from '../lib/api.js'
import { registerHref, requestPick } from '../lib/registerPick.js'
import {
  DAY_LABELS,
  buildSections,
  classLabel,
  sessionText,
  sharedTeacher,
  splitSchedule,
  subjectStyle,
  vnDateText,
} from '../lib/catalog.js'

// Nút lọc khối: một hàng cuộn ngang trên điện thoại.
function chipClass(on) {
  return `inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  }`
}

export default function ClassSchedule({ subjects, phone, phoneShown }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [grade, setGrade] = useState('all')
  // Thanh lọc dính dưới thanh tiêu đề khi cuộn; đổi khối lúc đã cuộn sâu thì đưa đầu danh sách về ngay dưới thanh lọc.
  const barRef = useRef(null)
  const listRef = useRef(null)
  const filtered = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!filtered.current) return
    const bar = barRef.current?.getBoundingClientRect()
    const list = listRef.current?.getBoundingClientRect()
    if (bar && list && list.top < bar.bottom) window.scrollBy(0, list.top - bar.bottom - 12)
  }, [grade])

  // Theo khối rồi theo môn (sort giữ thứ tự môn của buildSections): hai môn của cùng một khối nằm cạnh nhau.
  const sections = useMemo(
    () => [...buildSections(data?.classes ?? [], subjects)].sort((a, b) => a.grade - b.grade),
    [data, subjects],
  )
  const grades = [...new Set(sections.map((s) => s.grade))]
  const shown = sections.filter((s) => grade === 'all' || s.grade === grade)

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-base text-slate-600 shadow-sm">
        <p>{error}</p>
        <a href={`tel:${phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700 hover:underline">
          <Phone size={16} aria-hidden="true" />
          Gọi {phoneShown}
        </a>
      </div>
    )
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 py-8 text-base text-slate-500">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Đang tải lịch học…
      </p>
    )
  }
  if (sections.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-5 text-base text-slate-600 shadow-sm">
        Hiện chưa có lớp nào đang mở. Phụ huynh vui lòng liên hệ thầy để được tư vấn.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {sections.some((s) => s.groups.length > 0) && (
        <p className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <Layers size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
          <span>
            Lớp chia theo phần (<b>Phần 1, Phần 2</b>): mỗi tuần con học mỗi phần 1 buổi, <b>chọn 1 ca trong mỗi
            phần</b>.{' '}
            <a href="#lich-theo-phan" className="font-semibold text-brand-700 hover:underline">
              Xem giải thích
            </a>
          </span>
        </p>
      )}

      {grades.length > 1 && (
        <div
          ref={barRef}
          className="sticky top-16 z-10 -mx-4 border-b border-brand-100 bg-brand-50/95 px-4 py-2.5 backdrop-blur-sm sm:mx-0 sm:rounded-xl sm:border sm:px-3"
        >
          <div className="no-scrollbar flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Lọc theo khối">
            {['all', ...grades].map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={grade === g}
                className={chipClass(grade === g)}
                onClick={() => {
                  filtered.current = true
                  setGrade(g)
                }}
              >
                {g === 'all' ? 'Tất cả khối' : `Lớp ${g}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={listRef} className="grid gap-3 md:grid-cols-2">
        {shown.map((section) => (
          <Section key={section.key} section={section} today={data.today} />
        ))}
      </div>
    </div>
  )
}

function Section({ section, today }) {
  const style = subjectStyle(section.subject)
  const teacher = sharedTeacher(section)
  // Số buổi/tuần chỉ ghi khi mục là đúng một nhóm lớp (mỗi phần 1 buổi).
  const perWeek = section.groups.length === 1 && section.singles.length === 0 ? section.groups[0].parts.length : null
  const meta = [perWeek && `${perWeek} buổi/tuần`, teacher && `Giáo viên: ${teacher}`].filter(Boolean).join(' · ')
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-1 ${style.bar}`} aria-hidden="true" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="flex min-w-0 flex-wrap items-center gap-2 text-lg leading-tight font-bold text-slate-800">
            <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.tag}`}>{section.subject}</span>
            Lớp {section.grade}
          </h4>
          <a
            href={registerHref(section.subject, section.grade)}
            onClick={(event) => requestPick(event, section.subject, section.grade)}
            aria-label={`Đăng ký ${section.subject} lớp ${section.grade}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Đăng ký
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        {meta && <p className="mt-1 text-sm text-slate-500">{meta}</p>}

        <div className="mt-3 space-y-3">
          {section.groups.map((group) => (
            <div key={group.id} className="space-y-3">
              {section.groups.length > 1 && <p className="text-sm font-semibold text-slate-800">{group.name}</p>}
              {group.parts.map((part) => (
                <PartRow key={part.part} part={part} today={today} showTeacher={!teacher} />
              ))}
            </div>
          ))}
          {section.singles.length > 0 && (
            <Singles classes={section.singles} hasGroups={section.groups.length > 0} today={today} showTeacher={!teacher} />
          )}
        </div>
      </div>
    </section>
  )
}

function PartRow({ part, today, showTeacher }) {
  const count = part.classes.length
  return (
    <div>
      <p className="text-sm">
        <b className="text-brand-700">Phần {part.part}</b>
        <span className="text-slate-700"> · {count > 1 ? `chọn 1 trong ${count} ca` : 'có 1 ca'}</span>
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {part.classes.map((cls) => (
          <ClassSlots key={cls.id} cls={cls} today={today} showTeacher={showTeacher} joined />
        ))}
      </ul>
      <Changes classes={part.classes} today={today} />
    </div>
  )
}

// Lớp không thuộc nhóm: một lớp thì học cả các buổi của lớp; nhiều lớp thì chọn một lớp (ghi "Nhóm N", giáo viên
// ghi cạnh tên lớp nếu các lớp khác giáo viên).
function Singles({ classes, hasGroups, today, showTeacher }) {
  const one = classes.length === 1
  const sessions = one ? splitSchedule(classes[0].schedules ?? [], today).current.length : 0
  const rule = !one
    ? `chọn 1 trong ${classes.length} lớp`
    : sessions > 1
      ? `học cả ${sessions} buổi mỗi tuần`
      : sessions === 1
        ? '1 buổi mỗi tuần'
        : 'lịch học'
  return (
    <div>
      <p className="text-sm">
        {hasGroups && <b className="text-brand-700">Lớp khác · </b>}
        <span className="text-slate-700">{hasGroups ? rule : rule.charAt(0).toUpperCase() + rule.slice(1)}</span>
      </p>
      {one ? (
        <ul className="mt-1.5 flex flex-wrap gap-2">
          <ClassSlots cls={classes[0]} today={today} showTeacher={showTeacher} />
        </ul>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {classes.map((cls) => (
            <li key={cls.id}>
              <p className="text-sm">
                <b className="text-slate-800">{classLabel(cls)}</b>
                {showTeacher && cls.teacher && <span className="text-slate-500"> · {cls.teacher}</span>}
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                <ClassSlots cls={cls} today={today} showTeacher={false} />
              </ul>
            </li>
          ))}
        </ul>
      )}
      <Changes classes={classes} today={today} />
    </div>
  )
}

const SLOT = 'inline-flex flex-wrap items-baseline gap-x-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700'

function Session({ row }) {
  return (
    <>
      <b className="font-semibold text-slate-900">{DAY_LABELS[row.day] ?? `Thứ ${row.day}`}</b>
      <span>
        {row.start}–{row.end}
      </span>
    </>
  )
}

// Các ô buổi học của một lớp. joined: cả lớp là một ô (một ca của phần; lớp hiếm khi có hơn một buổi thì nối bằng
// "+"); không thì mỗi buổi một ô. Lớp chưa có lịch đang áp dụng mà đã đặt lịch mới thì ô ghi "Từ DD/MM/YYYY".
function ClassSlots({ cls, today, showTeacher, joined = false }) {
  const { current, upcoming } = splitSchedule(cls.schedules ?? [], today)
  const rows = current.length > 0 ? current : (upcoming?.rows ?? [])
  const prefix = current.length === 0 && upcoming && (
    <span className="font-medium text-amber-800">Từ {vnDateText(upcoming.from)}:</span>
  )
  const teacher = showTeacher && cls.teacher && <span className="text-slate-500">· {cls.teacher}</span>
  if (rows.length === 0) {
    return <li className={`${SLOT} text-slate-400`}>Chưa có lịch</li>
  }
  if (joined) {
    return (
      <li className={SLOT}>
        {prefix}
        {rows.map((row, i) => (
          <span key={`${row.day}-${row.start}`} className="inline-flex items-baseline gap-x-1.5">
            {i > 0 && <span aria-hidden="true">+</span>}
            <Session row={row} />
          </span>
        ))}
        {teacher}
      </li>
    )
  }
  return rows.map((row) => (
    <li key={`${row.day}-${row.start}`} className={SLOT}>
      {prefix}
      <Session row={row} />
      {teacher}
    </li>
  ))
}

// Lớp đang học mà đã đặt lịch mới: ghi một dòng đổi lịch dưới các ô.
function Changes({ classes, today }) {
  const changes = classes
    .map((cls) => ({ cls, ...splitSchedule(cls.schedules ?? [], today) }))
    .filter((c) => c.current.length > 0 && c.upcoming)
  return changes.map(({ cls, current, upcoming }) => (
    <p key={cls.id} className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
      <CalendarClock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        Từ {vnDateText(upcoming.from)}, ca {current.map(sessionText).join(' + ')} đổi sang{' '}
        {upcoming.rows.map(sessionText).join(' + ')}
      </span>
    </p>
  ))
}
