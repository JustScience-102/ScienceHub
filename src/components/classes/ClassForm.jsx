import { useMemo, useState } from 'react'
import Modal from '../Modal'
import FormField from '../FormField'
import SelectField from '../SelectField'
import Notice from '../Notice'
import { SUBJECTS, GRADES } from '../../lib/subjects'
import { WEEK_DAYS, formatTime } from '../../lib/schedule'
import { classNamePrefix, buildClassName, suggestClassNo } from '../../lib/className'
import { formatCurrency } from '../../lib/format'
import { compareVietnameseNames } from '../../lib/text'
import { validateRequired } from '../../lib/validators'

function parsePrice(raw) {
  const digits = String(raw ?? '').replace(/[\s.,]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : null
}

// Form Thêm / Sửa lớp. Tên lớp được ghép tự động: Môn_Khối_TênGV_STT.
// Mỗi ngày học có một khung giờ riêng (mỗi ngày tối đa một ca).
//   mode: 'create' | 'edit'
//   scheduleRows: các dòng class_schedules hiện có của lớp (khi sửa)
//   teachers: giáo viên đang hiển thị; takenNames: tên các lớp đang hiển thị khác
//   onSave(values): trả về câu báo lỗi hoặc ''
//   lockedTeacherId: Giáo viên đang đăng nhập (tự gán và khóa ô chọn giáo viên); Quản lý truyền null
export default function ClassForm({
  mode,
  cls,
  scheduleRows,
  teachers,
  lockedTeacherId = null,
  takenNames,
  onSave,
  onClose,
}) {
  const [subject, setSubject] = useState(cls?.subject ?? '')
  const [grade, setGrade] = useState(cls?.grade ? String(cls.grade) : '')
  const [teacherId, setTeacherId] = useState(() => {
    if (lockedTeacherId) return lockedTeacherId
    return cls?.teacher_id && teachers.some((teacher) => teacher.id === cls.teacher_id) ? cls.teacher_id : ''
  })
  // '' = tự gợi ý STT; có giá trị = người dùng tự nhập
  const [classNoInput, setClassNoInput] = useState('')
  // { [thứ]: { start: 'HH:MM', end: 'HH:MM' } }
  const [schedule, setSchedule] = useState(() => {
    const initial = {}
    for (const row of scheduleRows ?? []) {
      initial[row.day_of_week] = { start: formatTime(row.start_time), end: formatTime(row.end_time) }
    }
    return initial
  })
  const [price, setPrice] = useState(cls ? String(cls.price_per_session ?? 0) : '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => compareVietnameseNames(a.full_name, b.full_name)),
    [teachers],
  )
  const teacher = teachers.find((item) => item.id === teacherId)
  const prefix = classNamePrefix({ subject, grade, teacherName: teacher?.full_name })

  // Phần đầu tên lớp ban đầu (để giữ nguyên STT khi chỉ sửa giá, lịch...)
  const originalPrefix = useMemo(() => {
    if (!cls?.subject || !cls?.grade || !cls?.teacher_id) return ''
    const originalTeacher = teachers.find((item) => item.id === cls.teacher_id)
    return classNamePrefix({
      subject: cls.subject,
      grade: cls.grade,
      teacherName: originalTeacher?.full_name,
    })
  }, [cls, teachers])

  const autoNo =
    mode === 'edit' && cls?.class_no && prefix && prefix === originalPrefix
      ? cls.class_no
      : suggestClassNo(prefix, takenNames)

  const classNo = classNoInput !== '' ? Number(classNoInput) : autoNo
  const classNoValid = Number.isInteger(classNo) && classNo >= 1
  const previewName = classNoValid
    ? buildClassName({ subject, grade, teacherName: teacher?.full_name }, classNo)
    : ''

  const selectedDays = WEEK_DAYS.filter((day) => schedule[day.value])

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
    if (!classNoValid) classNoError = 'STT phải là số nguyên từ 1 trở lên.'
    else if (previewName && takenNames.some((name) => name.toLowerCase() === previewName.toLowerCase())) {
      classNoError = `Tên lớp ${previewName} đã có. Hãy đổi STT.`
    }

    const nextErrors = {
      subject: validateRequired(subject, 'Vui lòng chọn môn học.'),
      grade: validateRequired(grade, 'Vui lòng chọn khối.'),
      teacher: validateRequired(teacherId, 'Vui lòng chọn giáo viên phụ trách.'),
      classNo: classNoError,
      schedule: scheduleError,
      price: priceValue === null ? 'Đơn giá phải là số nguyên từ 0 trở lên.' : '',
    }
    setErrors(nextErrors)
    setFormError('')
    if (Object.values(nextErrors).some(Boolean)) return

    setSaving(true)
    const message = await onSave({
      name: previewName,
      subject,
      grade: Number(grade),
      classNo,
      teacherId,
      price: priceValue,
      schedule: selectedDays.map((day) => ({
        day: day.value,
        start: schedule[day.value].start,
        end: schedule[day.value].end,
      })),
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
          required
          type="number"
          inputMode="numeric"
          value={classNoInput !== '' ? classNoInput : String(autoNo)}
          onChange={setClassNoInput}
          error={errors.classNo}
          hint="Tự gợi ý số kế tiếp còn trống. Đổi nếu cùng giáo viên dạy nhiều nhóm."
        />

        <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm">
          <span className="text-slate-500">Tên lớp (tự tạo): </span>
          {previewName ? (
            <span className="break-all font-semibold text-sky-700">{previewName}</span>
          ) : (
            <span className="text-slate-400">Chọn môn, khối và giáo viên để tạo tên.</span>
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
