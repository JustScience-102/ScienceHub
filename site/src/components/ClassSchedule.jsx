// Lịch học các lớp đang mở (phần Lớp học & học phí của trang chủ), lấy từ app quản lý qua /api/lop-hoc
// (site/api/lop-hoc.js; dùng chung một lần tải với form đăng ký, loadCatalog). Nút "Đăng ký lịch này" đưa xuống phần
// Đăng ký của cùng trang và chọn sẵn môn + khối trong form (src/lib/registerPick.js).
// Lớp thuộc nhóm lớp hiện theo phần (khung riêng từng phần, nối bằng dấu +): mỗi phần là một nội dung, phụ huynh
// chọn một ca cho mỗi phần; kèm ví dụ các cách chọn đúng (✓) và một cách sai (✕) tính từ lịch thật.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarClock, Check, Loader2, Phone, X } from 'lucide-react'
import { loadCatalog } from '../lib/api.js'
import { registerHref, requestPick } from '../lib/registerPick.js'
import {
  buildSections,
  classLabel,
  partCombos,
  sessionText,
  sharedTeacher,
  splitSchedule,
  subjectStyle,
  vnDateText,
} from '../lib/catalog.js'

// Nút lọc: một hàng cuộn ngang trên điện thoại; nút môn đang chọn mang màu của môn (subjectStyle().chip).
function chipClass(on, activeClass = 'border-brand-600 bg-brand-600 text-white') {
  return `inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
    on ? activeClass : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  }`
}

export default function ClassSchedule({ subjects, phone, phoneShown }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [subject, setSubject] = useState('all')
  const [grade, setGrade] = useState('all')
  // Thanh lọc dính dưới thanh tiêu đề khi cuộn; đổi môn/khối lúc đã cuộn sâu thì đưa đầu danh sách về ngay dưới thanh lọc.
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
  }, [subject, grade])

  const sections = useMemo(() => buildSections(data?.classes ?? [], subjects), [data, subjects])
  const subjectList = [...new Set(sections.map((s) => s.subject))]
  const gradeList = [...new Set(sections.filter((s) => subject === 'all' || s.subject === subject).map((s) => s.grade))].sort(
    (a, b) => a - b,
  )
  const shown = sections.filter(
    (s) => (subject === 'all' || s.subject === subject) && (grade === 'all' || s.grade === grade),
  )

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
    <div className="space-y-4">
      {(subjectList.length > 1 || gradeList.length > 1) && (
        <div
          ref={barRef}
          className="sticky top-16 z-10 -mx-4 space-y-2 border-b border-brand-100 bg-brand-50/95 px-4 py-2.5 backdrop-blur-sm sm:mx-0 sm:rounded-xl sm:border sm:px-3"
        >
          {subjectList.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Lọc theo môn">
              {['all', ...subjectList].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={subject === s}
                  className={chipClass(subject === s, s === 'all' ? undefined : subjectStyle(s).chip)}
                  onClick={() => {
                    filtered.current = true
                    setSubject(s)
                    setGrade('all')
                  }}
                >
                  {s === 'all' ? 'Tất cả môn' : s}
                </button>
              ))}
            </div>
          )}
          {gradeList.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Lọc theo khối">
              {['all', ...gradeList].map((g) => (
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
          )}
        </div>
      )}

      <div ref={listRef} className="scroll-mt-40 space-y-4">
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
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-1.5 ${style.bar}`} aria-hidden="true" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.tag}`}>{section.subject}</span>
            Lớp {section.grade}
          </h4>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto">
            {teacher && <span className="text-sm text-slate-500">Giáo viên: {teacher}</span>}
            <a
              href={registerHref(section.subject, section.grade)}
              onClick={(event) => requestPick(event, section.subject, section.grade)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:min-h-10 sm:w-auto"
            >
              Đăng ký lịch này
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        {section.groups.map((group) => (
          <GroupBlock key={group.id} group={group} today={today} showTeacher={!teacher} />
        ))}

        {section.singles.length > 0 && (
          <div className="mt-4">
            {section.groups.length > 0 && <p className="mb-2 text-sm font-semibold text-slate-700">Các lớp khác</p>}
            <ul className="space-y-2">
              {section.singles.map((cls) => (
                <li key={cls.id} className="rounded-lg border border-slate-200 p-3">
                  <ClassLine cls={cls} today={today} showTeacher={!teacher} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function GroupBlock({ group, today, showTeacher }) {
  const { combos, total, wrongExample } = partCombos(group, today)
  const perWeek = group.parts.map((p) => `1 buổi Phần ${p.part}`).join(' + ')
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
        <p className="text-base font-semibold">
          Mỗi tuần con học {group.parts.length} buổi: {perWeek}.
        </p>
        <p className="mt-1 text-sm">
          Mỗi phần là một nội dung riêng và mở nhiều ca. Phụ huynh <b>chọn 1 ca trong mỗi phần</b>; không chọn 2 ca của
          cùng một phần vì hai ca đó học cùng nội dung.
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {group.parts.map((part, index) => (
          <Fragment key={part.part}>
            {index > 0 && (
              <div className="flex items-center justify-center" aria-hidden="true">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">
                  +
                </span>
              </div>
            )}
            <div className="flex-1 overflow-hidden rounded-xl border-2 border-brand-300">
              <div className="flex items-center justify-between gap-2 bg-brand-600 px-4 py-2 text-white">
                <span className="text-base font-bold">Phần {part.part}</span>
                <span className="text-sm">
                  {part.classes.length > 1 ? `Chọn 1 trong ${part.classes.length} ca` : 'Có 1 ca'}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 bg-white">
                {part.classes.map((cls) => (
                  <li key={cls.id} className="px-4 py-3">
                    <ClassLine cls={cls} today={today} showTeacher={showTeacher} />
                  </li>
                ))}
              </ul>
            </div>
          </Fragment>
        ))}
      </div>

      {combos.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Ví dụ cách chọn lịch</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {combos.map((combo) => (
              <li
                key={combo}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
              >
                <Check size={14} aria-hidden="true" />
                <span>
                  {combo}
                  <span className="sr-only">: được</span>
                </span>
              </li>
            ))}
            {total > combos.length && (
              <li className="inline-flex items-center px-1 text-sm text-slate-500">và {total - combos.length} cách khác</li>
            )}
          </ul>
          {wrongExample && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200">
              <X size={14} aria-hidden="true" />
              {wrongExample.label}: không được, vì cùng Phần {wrongExample.part}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ClassLine({ cls, today, showTeacher }) {
  const { current, upcoming } = splitSchedule(cls.schedules ?? [], today)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-slate-800">{classLabel(cls)}</b>
          {current.map((row) => (
            <span key={`${row.day}-${row.start}`} className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
              {sessionText(row)}
            </span>
          ))}
          {current.length === 0 && !upcoming && <span className="text-sm text-slate-400">Chưa có lịch</span>}
        </div>
        {showTeacher && cls.teacher && <span className="text-sm text-slate-500">Giáo viên: {cls.teacher}</span>}
      </div>
      {upcoming && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-800">
          <CalendarClock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {current.length > 0 ? 'Lịch mới' : 'Bắt đầu'} từ {vnDateText(upcoming.from)}: {upcoming.rows.map(sessionText).join(', ')}
          </span>
        </p>
      )}
    </div>
  )
}
