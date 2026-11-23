import { useMemo, useState } from 'react'
import SearchInput from '../SearchInput'
import { normalizeText } from '../../lib/text'
import { formatCurrency } from '../../lib/format'
import { formatSchedule } from '../../lib/schedule'
import { classGrade } from '../../lib/grade'
import { classTitle } from '../../lib/dashboard'

// Danh sách lớp để chọn một lớp (radio) kèm ô tìm theo tên.
// choices: [{ cls, counts, blockReason }]; lớp có blockReason bị khóa và hiện lý do.
export default function ClassPickList({ choices, counts, selectedId, onSelect, idPrefix }) {
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const keyword = normalizeText(query)
    if (!keyword) return choices
    return choices.filter(({ cls }) =>
      normalizeText([cls.name, cls.subject, cls.teachers?.full_name].join(' ')).includes(keyword),
    )
  }, [choices, query])

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-search`} className="mb-1 block text-sm font-medium text-slate-700">
          Tìm lớp theo tên, môn hoặc giáo viên
        </label>
        <SearchInput
          id={`${idPrefix}-search`}
          value={query}
          onChange={setQuery}
          placeholder="Ví dụ: Toan_9 hoặc tên giáo viên"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Không có lớp phù hợp.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Danh sách lớp"
          className="max-h-72 overflow-y-auto rounded-lg border border-slate-200"
        >
          <ul className="divide-y divide-slate-100">
            {shown.map(({ cls, blockReason }) => {
              const disabled = Boolean(blockReason)
              const grade = classGrade(cls)
              return (
                <li key={cls.id}>
                  <label
                    className={`flex min-h-11 items-start gap-3 px-3 py-2 text-sm ${
                      disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50'
                    } ${selectedId === cls.id ? 'bg-sky-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`${idPrefix}-class`}
                      value={cls.id}
                      disabled={disabled}
                      checked={selectedId === cls.id}
                      onChange={() => onSelect(cls.id)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="flex-1">
                      <span className="font-medium">{classTitle(cls)}</span>
                      <span className="block text-xs text-slate-500">
                        {cls.subject || 'Chưa có môn'} · {grade ? `Khối ${grade}` : 'Chưa có khối'} ·{' '}
                        {cls.teachers?.full_name || 'Chưa gắn giáo viên'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatSchedule(cls.class_schedules)} · {formatCurrency(cls.price_per_session)}/buổi ·{' '}
                        {counts[cls.id] ?? 0} học sinh
                      </span>
                      {blockReason && <span className="block text-xs text-red-600">{blockReason}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
