// Lịch học các lớp đang mở (trang Lớp học & học phí), lấy từ app quản lý qua /api/lop-hoc (site/api/lop-hoc.js).
// Lớp thuộc nhóm lớp hiện theo phần: mỗi phần là một nội dung, phụ huynh chọn một ca cho mỗi phần.
import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2, Phone } from 'lucide-react'
import { api } from '../lib/api.js'
import { buildSections, classLabel, sessionText, splitSchedule, subjectStyle, vnDateText } from '../lib/catalog.js'

function chipClass(on) {
  return `inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
    on ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  }`
}

export default function ClassSchedule({ subjects, phone, phoneShown }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [subject, setSubject] = useState('all')
  const [grade, setGrade] = useState('all')

  useEffect(() => {
    let cancelled = false
    api('/api/lop-hoc')
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
        <a href={`tel:${phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-sky-700 hover:underline">
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
        <div className="space-y-2">
          {subjectList.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo môn">
              {['all', ...subjectList].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={subject === s}
                  className={chipClass(subject === s)}
                  onClick={() => {
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
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo khối">
              {['all', ...gradeList].map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={grade === g}
                  className={chipClass(grade === g)}
                  onClick={() => setGrade(g)}
                >
                  {g === 'all' ? 'Tất cả khối' : `Lớp ${g}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {shown.map((section) => (
        <Section key={section.key} section={section} today={data.today} />
      ))}
    </div>
  )
}

function Section({ section, today }) {
  const style = subjectStyle(section.subject)
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-1.5 ${style.bar}`} aria-hidden="true" />
      <div className="p-5">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.tag}`}>{section.subject}</span>
          Lớp {section.grade}
        </h3>

        {section.groups.map((group) => (
          <div key={group.id} className="mt-4">
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Mỗi tuần học {group.parts.length} buổi, mỗi buổi một phần nội dung. Con chọn <b>1 ca cho mỗi phần</b>, không
              học 2 ca của cùng một phần.
            </p>
            {group.parts.map((part) => (
              <div key={part.part} className="mt-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Phần {part.part} · chọn 1 trong {part.classes.length} ca
                </p>
                <ul className="space-y-2">
                  {part.classes.map((cls) => (
                    <ClassRow key={cls.id} cls={cls} today={today} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}

        {section.singles.length > 0 && (
          <div className="mt-4">
            {section.groups.length > 0 && <p className="mb-2 text-sm font-semibold text-slate-700">Các lớp khác</p>}
            <ul className="space-y-2">
              {section.singles.map((cls) => (
                <ClassRow key={cls.id} cls={cls} today={today} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function ClassRow({ cls, today }) {
  const { current, upcoming } = splitSchedule(cls.schedules ?? [], today)
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <b className="text-slate-800">{classLabel(cls)}</b>
        {cls.teacher && <span className="text-sm text-slate-500">Giáo viên: {cls.teacher}</span>}
      </div>
      {current.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {current.map((row) => (
            <span
              key={`${row.day}-${row.start}`}
              className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700"
            >
              {sessionText(row)}
            </span>
          ))}
        </div>
      ) : (
        !upcoming && <p className="mt-2 text-sm text-slate-400">Chưa có lịch</p>
      )}
      {upcoming && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-800">
          <CalendarClock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {current.length > 0 ? 'Lịch mới' : 'Bắt đầu'} từ {vnDateText(upcoming.from)}:{' '}
            {upcoming.rows.map(sessionText).join(', ')}
          </span>
        </p>
      )}
    </li>
  )
}
