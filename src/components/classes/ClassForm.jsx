import { useMemo, useState } from 'react'
import Modal from '../Modal'
import FormField from '../FormField'
import SelectField from '../SelectField'
import Notice from '../Notice'
import { SUBJECTS, GRADES } from '../../lib/subjects'
import {
  WEEK_DAYS,
  currentSchedules,
  formatScheduleRows,
  formatTime,
  monthStartISO,
  todayISO,
} from '../../lib/schedule'
import { useClassNamePreview } from '../../lib/classNamePreview'
import { formatCurrency, formatDate } from '../../lib/format'
import { compareVietnameseNames } from '../../lib/text'
import { validateRequired } from '../../lib/validators'

function parsePrice(raw) {
  const digits = String(raw ?? '').replace(/[\s.,]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

// { [thứ]: { start, end } } -> chuỗi so sánh ổn định
function scheduleKey(map) {
  return WEEK_DAYS.filter((day) => map[day.value])
    .map((day) => `${day.value}|${map[day.value].start}|${map[day.value].end}`)
    .join(';')
}

// Các thời kỳ lịch đã đóng, mới nhất trước: [{ from, to, rows }]
function pastPeriods(rows) {
  const groups = new Map()
  for (const row of rows ?? []) {
    if (!row.valid_to) continue
    const key = `${row.valid_from ?? ''}|${row.valid_to}`
    if (!groups.has(key)) groups.set(key, { from: row.valid_from, to: row.valid_to, rows: [] })
    groups.get(key).rows.push(row)
  }
  return [...groups.values()].sort((a, b) => b.to.localeCompare(a.to))
}

// Form Thêm / Sửa lớp. Tên lớp do Database đặt theo Môn_Khối_TênGọiGV_STT (form chỉ xem trước).
// Mỗi ngày học có một khung giờ riêng (mỗi ngày tối đa một ca). Khi sửa mà đổi lịch, chọn ngày áp dụng
// lịch mới; lịch cũ vẫn dùng cho các ngày trước đó.
//   mode: 'create' | 'edit'
//   scheduleRows: mọi dòng class_schedules của lớp (mọi thời kỳ, khi sửa)
//   teachers: giáo viên đang hiển thị
//   onSave(values): trả về câu báo lỗi hoặc ''
//   lockedTeacherId: Giáo viên đang đăng nhập (tự gán và khóa ô chọn giáo viên); Quản lý truyền null
export default function ClassForm({ mode, cls, scheduleRows, teachers, lockedTeacherId = null, onSave, onClose }) {
  const [subject, setSubject] = useState(cls?.subject ?? '')
  const [grade, setGrade] = useState(cls?.grade ? String(cls.grade) : '')
  const [teacherId, setTeacherId] = useState(() => {
    if (lockedTeacherId) return lockedTeacherId
    return cls?.teacher_id && teachers.some((teacher) => teacher.id === cls.teacher_id) ? cls.teacher_id : ''
  })
  // '' = để Database tự chọn STT; có giá trị = người dùng tự nhập
  const [classNoInput, setClassNoInput] = useState('')
  const initialSchedule = useMemo(() => {
    const initial = {}
    for (const row of currentSchedules(scheduleRows)) {
      initial[row.day_of_week] = { start: formatTime(row.start_time), end: formatTime(row.end_time) }
    }
    return initial
  }, [scheduleRows])
  // { [thứ]: { start: 'HH:MM', end: 'HH:MM' } }
  const [schedule, setSchedule] = useState(initialSchedule)
  const [scheduleFrom, setScheduleFrom] = useState(todayISO())
  const [price, setPrice] = useState(cls ? String(cls.price_per_session ?? 0) : '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => compareVietnameseNames(a.full_name, b.full_name)),
    [teachers],
  )

  // Giữ STT cũ khi chỉ sửa giá, lịch...; đổi môn/khối/giáo viên thì Database chọn STT còn trống.
  const sameSlot =
    mode === 'edit' && cls && cls.subject === subject && String(cls.grade) === grade && cls.teacher_id === teacherId
  const typedNo = classNoInput !== '' ? Number(classNoInput) : null
  const preview = useClassNamePreview({
    classId: cls?.id ?? null,
    subject,
    grade,
    teacherId,
    classNo: typedNo,
    keepClassNo: sameSlot ? cls.class_no : null,
  })

  const selectedDays = WEEK_DAYS.filter((day) => schedule[day.value])
  const scheduleChanged = mode === 'edit' && scheduleKey(schedule) !== scheduleKey(initialSchedule)
  const currentFrom = currentSchedules(scheduleRows)
    .map((row) => row.valid_from)
    .filter(Boolean)
    .sort()
    .pop()
  const minFrom = [currentFrom, lockedTeacherId ? monthStartISO() : ''].filter(Boolean).sort().pop() ?? ''
  const history = mode === 'edit' ? pastPeriods(scheduleRows) : []

  function toggleDay(day) {
    setSchedule((current) => {
      if (current[day]) {
        const { [day]: removed, ...rest } = current
        void removed
        return rest
      }
      // Giờ điền sẵn theo ngày đã chọn gần nhất (có thể sửa riêng cho từng ngày)
      const lastDay = WEEK_DAYS.filter((item) => current[item.value]).pop()
      const preset = lastDay ? current[lastDay.value] : { start: '', end: '' }
      return { ...current, [day]: { ...preset } }
    })
  }

  function setTime(day, field, value) {
    setSchedule((current) => ({ ...current, [day]: { ...current[day], [field]: value } }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const priceValue = parsePrice(price)

    let scheduleError = ''
    if (selectedDays.length === 0) {
      scheduleError = 'Vui lòng chọn ít nhất một ngày học trong tuần.'
    } else {
      const missing = selectedDays.find((day) => !schedule[day.value].start || !schedule[day.value].end)
      const reversed = selectedDays.find(
        (day) => schedule[day.value].start && schedule[day.value].end && schedule[day.value].end <= schedule[day.value].start,
      )
      if (missing) scheduleError = `Vui lòng nhập giờ bắt đầu và giờ kết thúc cho ${missing.full}.`
      else if (reversed) scheduleError = `${reversed.full}: giờ kết thúc phải sau giờ bắt đầu.`
    }

    let classNoError = ''
    if (typedNo !== null && (!Number.isInteger(typedNo) || typedNo < 1)) classNoError = 'STT phải là số nguyên từ 1 trở lên.'
    else if (typedNo !== null && preview.taken) classNoError = `STT ${typedNo} đã có lớp khác dùng. Hãy đổi STT hoặc để trống.`

    let fromError = ''
    if (scheduleChanged) {
      if (!scheduleFrom) fromError = 'Vui lòng chọn ngày áp dụng lịch mới.'
      else if (minFrom && scheduleFrom < minFrom) fromError = `Ngày áp dụng phải từ ${formatDate(minFrom)} trở đi.`
    }

    const nextErrors = {
      subject: validateRequired(subject, 'Vui lòng chọn môn học.'),
      grade: validateRequired(grade, 'Vui lòng chọn khối.'),
      teacher: validateRequired(teacherId, 'Vui lòng chọn giáo viên phụ trách.'),
      classNo: classNoError,
      schedule: scheduleError,
      scheduleFrom: fromError,
      price: priceValue === null ? 'Đơn giá phải là số nguyên từ 0 trở lên.' : '',
    }
    setErrors(nextErrors)
    setFormError('')
    if (Object.values(nextErrors).some(Boolean)) return

    setSaving(true)
    const message = await onSave({
      subject,
      grade: Number(grade),
      classNo: typedNo,
      teacherId,
      price: priceValue,
      schedule: selectedDays.map((day) => ({
        day: day.value,
        start: schedule[day.value].start,
        end: schedule[day.value].end,
      })),
      scheduleFrom: scheduleChanged ? scheduleFrom : null,
    })
    setSaving(false)
    if (message) setFormError(message)
  }

  const priceValue = parsePrice(price)

  return (
    <Modal title={mode === 'edit' ? 'Sửa lớp' : 'Thêm lớp'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Notice type="error">{formError}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="class-subject"
            label="Môn học"
            required
            value={subject}
            onChange={(value) => {
              setSubject(value)
              setClassNoInput('')
            }}
            error={errors.subject}
            placeholder="Chọn môn học"
          >
            {SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="class-grade"
            label="Khối"
            required
            value={grade}
            onChange={(value) => {
              setGrade(value)
              setClassNoInput('')
            }}
            error={errors.grade}
            placeholder="Chọn khối"
          >
            {GRADES.map((item) => (
              <option key={item} value={item}>
                Khối {item}
              </option>
            ))}
          </SelectField>
        </div>

        <SelectField
          id="class-teacher"
          label="Giáo viên phụ trách"
          required
          value={teacherId}
          onChange={(value) => {
            setTeacherId(value)
            setClassNoInput('')
          }}
          error={errors.teacher}
          disabled={Boolean(lockedTeacherId)}
          hint={lockedTeacherId ? 'Giáo viên chỉ tạo và chỉnh sửa lớp của chính mình.' : undefined}
          placeholder="Chọn giáo viên"
        >
          {sortedTeachers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.full_name}
            </option>
          ))}
        </SelectField>

        <FormField
          id="class-no"
          label="STT lớp"
          type="number"
          inputMode="numeric"
          value={classNoInput !== '' ? classNoInput : preview.classNo ? String(preview.classNo) : ''}
          onChange={setClassNoInput}
          error={errors.classNo}
          hint="Để nguyên số gợi ý (số nhỏ nhất còn trống). Đổi nếu cùng giáo viên dạy nhiều nhóm."
        />

        <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm">
          <span className="text-slate-500">Tên lớp (Trung tâm tự đặt): </span>
          {!subject || !grade || !teacherId ? (
            <span className="text-slate-400">Chọn môn, khối và giáo viên để xem tên lớp.</span>
          ) : preview.loading ? (
            <span className="text-slate-400">Đang xem trước...</span>
          ) : preview.error ? (
            <span className="text-slate-400">Chưa xem trước được tên lớp (tên sẽ được đặt khi lưu).</span>
          ) : (
            <span className="break-all font-semibold text-sky-700">{preview.name}</span>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Ngày học trong tuần<span className="text-red-500"> *</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((day) => {
              const on = Boolean(schedule[day.value])
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  aria-pressed={on}
                  aria-label={day.full}
                  className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    on
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {day.short}
                </button>
              )
            })}
          </div>

          {selectedDays.length > 0 && (
            <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                Mỗi ngày học một khung giờ riêng. Giờ được điền sẵn theo ngày trước, bạn sửa riêng cho từng ngày.
              </p>
              {selectedDays.map((day) => (
                <div key={day.value} className="grid grid-cols-[4.5rem_1fr_1fr] items-end gap-2">
                  <span className="pb-3 text-sm font-medium text-slate-700">{day.full}</span>
                  <FormField
                    id={`class-start-${day.value}`}
                    label="Bắt đầu"
                    type="time"
                    value={schedule[day.value].start}
                    onChange={(value) => setTime(day.value, 'start', value)}
                  />
                  <FormField
                    id={`class-end-${day.value}`}
                    label="Kết thúc"
                    type="time"
                    value={schedule[day.value].end}
                    onChange={(value) => setTime(day.value, 'end', value)}
                  />
                </div>
              ))}
            </div>
          )}
          {errors.schedule && <p className="mt-1 text-xs text-red-600">{errors.schedule}</p>}
        </fieldset>

        {scheduleChanged && (
          <FormField
            id="class-schedule-from"
            label="Áp dụng lịch mới từ ngày"
            required
            type="date"
            value={scheduleFrom}
            min={minFrom || undefined}
            onChange={setScheduleFrom}
            error={errors.scheduleFrom}
            hint="Các ngày trước ngày này vẫn điểm danh theo lịch cũ."
          />
        )}

        {history.length > 0 && (
          <div className="rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-700">Lịch trước đây</p>
            <ul className="space-y-0.5">
              {history.map((period) => (
                <li key={`${period.from}|${period.to}`}>
                  {period.from ? `${formatDate(period.from)} – ` : 'Đến '}
                  {formatDate(period.to)}: {formatScheduleRows(period.rows)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <FormField
          id="class-price"
          label="Đơn giá mỗi buổi (đồng)"
          required
          inputMode="numeric"
          value={price}
          onChange={setPrice}
          error={errors.price}
          placeholder="100000"
          hint={
            (priceValue !== null ? `${formatCurrency(priceValue)}/buổi. ` : '') +
            (mode === 'create'
              ? ''
              : 'Đổi đơn giá chỉ áp dụng cho các buổi điểm danh từ nay về sau, doanh thu các buổi đã điểm danh giữ nguyên.')
          }
        />

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
