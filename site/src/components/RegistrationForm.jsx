// Form đăng ký học (trang Đăng ký học, mốc M3). Lịch lấy từ /api/lop-hoc; gửi đơn tới /api/dang-ky.
// Lớp thuộc nhóm lớp: mỗi phần là một nhóm nút chọn (radio) nên không thể chọn 2 ca cùng phần; phải chọn đủ các phần.
// Mở từ nút "Đăng ký lịch này" ở trang Lớp học: ?mon=<môn>&khoi=<khối> chọn sẵn môn và khối.
import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CircleCheck, Loader2, Phone } from 'lucide-react'
import { api } from '../lib/api.js'
import { buildSections, classLabel, sessionText, splitSchedule, subjectStyle } from '../lib/catalog.js'
import {
  EMPTY_FORM,
  buildPayload,
  defaultPick,
  overlapError,
  pickError,
  pickedClasses,
  sectionOptions,
  validateFields,
  withDefaultParts,
} from '../lib/registration.js'

const INPUT =
  'w-full min-h-12 rounded-lg border bg-white px-3 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
const inputClass = (error) => `${INPUT} ${error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-sky-500'}`
const CARD = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6'

function Field({ id, label, required, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

function StepTitle({ no, children }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-slate-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
        {no}
      </span>
      {children}
    </h2>
  )
}

const scheduleText = (cls, today) => splitSchedule(cls.schedules ?? [], today).current.map(sessionText).join(', ') || 'Chưa có lịch'

export default function RegistrationForm({ subjects, phone, phoneShown }) {
  const [catalog, setCatalog] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [chosen, setChosen] = useState([]) // khóa mục "môn|khối" phụ huynh đánh dấu
  const [picks, setPicks] = useState({}) // khóa mục -> { option, parts: { [phần]: classId } }
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const sections = useMemo(() => buildSections(catalog?.classes ?? [], subjects), [catalog, subjects])
  const today = catalog?.today ?? ''

  useEffect(() => {
    let cancelled = false
    api('/api/lop-hoc')
      .then((data) => {
        if (cancelled) return
        setCatalog(data)
        // Chọn sẵn từ nút "Đăng ký lịch này" (?mon=Vật Lí&khoi=12).
        const params = new URLSearchParams(window.location.search)
        const grade = Number(params.get('khoi'))
        const subject = params.get('mon')
        const section = buildSections(data.classes ?? [], subjects).find((s) => s.grade === grade && s.subject === subject)
        if (section) {
          setForm((f) => ({ ...f, grade: String(grade) }))
          setChosen([section.key])
          setPicks({ [section.key]: defaultPick(section) })
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [subjects])

  const grades = [...new Set(sections.map((s) => s.grade))].sort((a, b) => a - b)
  const gradeSections = sections.filter((s) => String(s.grade) === String(form.grade))
  const activeSections = gradeSections.filter((s) => chosen.includes(s.key))
  const allPicked = activeSections.flatMap((s) => pickedClasses(s, picks[s.key]))
  const overlap = overlapError(allPicked, today)

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: '' }))
  }

  function changeGrade(grade) {
    setField('grade', String(grade))
    setChosen([])
    setPicks({})
    setErrors((e) => ({ ...e, subjects: '' }))
  }

  function toggleSection(section) {
    setErrors((e) => ({ ...e, subjects: '', [`pick:${section.key}`]: '' }))
    if (chosen.includes(section.key)) {
      setChosen(chosen.filter((k) => k !== section.key))
      return
    }
    setChosen([...chosen, section.key])
    setPicks((p) => ({ ...p, [section.key]: p[section.key] ?? defaultPick(section) }))
  }

  function updatePick(section, next) {
    setPicks((p) => ({ ...p, [section.key]: next }))
    setErrors((e) => ({ ...e, [`pick:${section.key}`]: '' }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitError('')
    const next = validateFields(form)
    if (activeSections.length === 0) next.subjects = 'Vui lòng chọn ít nhất một môn và lịch học.'
    for (const section of activeSections) {
      const message = pickError(section, picks[section.key])
      if (message) next[`pick:${section.key}`] = message
    }
    const problems = Object.fromEntries(Object.entries(next).filter(([, v]) => v))
    setErrors(problems)
    if (Object.keys(problems).length > 0 || overlap) {
      setSubmitError('Vui lòng kiểm tra lại các ô báo đỏ ở trên.')
      return
    }
    setBusy(true)
    try {
      const payload = { ...buildPayload(form, allPicked.map((c) => c.id)), consent: form.consent, website: form.website }
      const result = await api('/api/dang-ky', { method: 'POST', body: payload })
      setDone({
        updated: result.updated,
        name: payload.student_name,
        phone: payload.parent_phone,
        lines: activeSections.map((s) => ({
          key: s.key,
          title: `${s.subject} ${s.grade}`,
          text: pickedClasses(s, picks[s.key]).map((c) => `${classLabel(c)}: ${scheduleText(c, today)}`).join(' + '),
        })),
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={CARD}>
        <div className="flex items-start gap-3">
          <CircleCheck size={28} aria-hidden="true" className="shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Đã gửi đăng ký cho con {done.name}</h2>
            <p className="mt-1 text-base text-slate-600">
              {done.updated && 'Đơn trước đó của con đã được cập nhật theo lựa chọn mới. '}
              Thầy sẽ gọi lại cho phụ huynh qua số <b>{done.phone}</b> trong thời gian sớm nhất để xác nhận lịch học.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {done.lines.map((line) => (
            <li key={line.key} className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <b className="text-slate-800">{line.title}:</b> {line.text}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setDone(null)
            setForm(EMPTY_FORM)
            setChosen([])
            setPicks({})
            setErrors({})
          }}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Đăng ký cho con khác
        </button>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={`${CARD} text-base text-slate-600`}>
        <p>{loadError}</p>
        <a href={`tel:${phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-sky-700 hover:underline">
          <Phone size={16} aria-hidden="true" />
          Gọi {phoneShown} để đăng ký
        </a>
      </div>
    )
  }
  if (!catalog) {
    return (
      <p className="flex items-center gap-2 py-8 text-base text-slate-500">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Đang tải lịch học…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <section className={CARD}>
        <StepTitle no={1}>Thông tin học sinh</StepTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="student_name" label="Họ tên của con" required error={errors.student_name}>
            <input
              id="student_name"
              className={inputClass(errors.student_name)}
              value={form.student_name}
              onChange={(e) => setField('student_name', e.target.value)}
              autoComplete="off"
              maxLength={100}
            />
          </Field>
          <Field id="school" label="Trường đang học" error={errors.school}>
            <input
              id="school"
              className={inputClass(errors.school)}
              value={form.school}
              onChange={(e) => setField('school', e.target.value)}
              placeholder="Ví dụ: THPT Bãi Cháy"
              maxLength={150}
            />
          </Field>
          <Field id="student_phone" label="Số điện thoại của con" hint="Không bắt buộc." error={errors.student_phone}>
            <input
              id="student_phone"
              className={inputClass(errors.student_phone)}
              type="tel"
              inputMode="tel"
              value={form.student_phone}
              onChange={(e) => setField('student_phone', e.target.value)}
              placeholder="0912345678"
            />
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-slate-700">
            Khối lớp của con<span className="text-red-500"> *</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {grades.map((grade) => {
              const on = String(grade) === String(form.grade)
              return (
                <label
                  key={grade}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-base font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-300 ${
                    on ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="grade" className="sr-only" checked={on} onChange={() => changeGrade(grade)} />
                  Lớp {grade}
                </label>
              )
            })}
          </div>
          {errors.grade && <p className="mt-1 text-sm text-red-600">{errors.grade}</p>}
        </fieldset>
      </section>

      <section className={CARD}>
        <StepTitle no={2}>Môn và lịch học</StepTitle>
        {!form.grade ? (
          <p className="text-base text-slate-500">Phụ huynh chọn khối lớp của con ở bước 1 để xem các môn và lịch học.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {gradeSections.map((section) => {
                const on = chosen.includes(section.key)
                return (
                  <label
                    key={section.key}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-300 ${
                      on ? 'border-sky-600 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" className="h-5 w-5 accent-sky-600" checked={on} onChange={() => toggleSection(section)} />
                    {section.subject} {section.grade}
                  </label>
                )
              })}
            </div>
            {errors.subjects && <p className="text-sm text-red-600">{errors.subjects}</p>}
            {activeSections.map((section) => (
              <SchedulePicker
                key={section.key}
                section={section}
                today={today}
                pick={picks[section.key] ?? { option: null, parts: {} }}
                onChange={(next) => updatePick(section, next)}
                error={errors[`pick:${section.key}`]}
              />
            ))}
            {overlap && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {overlap}
              </p>
            )}
          </div>
        )}
      </section>

      <section className={CARD}>
        <StepTitle no={3}>Thông tin phụ huynh</StepTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="parent_name" label="Họ tên phụ huynh" required error={errors.parent_name}>
            <input
              id="parent_name"
              className={inputClass(errors.parent_name)}
              value={form.parent_name}
              onChange={(e) => setField('parent_name', e.target.value)}
              autoComplete="name"
              maxLength={100}
            />
          </Field>
          <Field
            id="parent_phone"
            label="Số điện thoại phụ huynh"
            required
            hint="Thầy gọi lại qua số này; số này cũng dùng để tra cứu điểm của con."
            error={errors.parent_phone}
          >
            <input
              id="parent_phone"
              className={inputClass(errors.parent_phone)}
              type="tel"
              inputMode="tel"
              value={form.parent_phone}
              onChange={(e) => setField('parent_phone', e.target.value)}
              autoComplete="tel"
              placeholder="0912345678"
            />
          </Field>
        </div>
      </section>

      <section className={CARD}>
        <StepTitle no={4}>Thông tin thêm</StepTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="referrer_code"
            label="Mã học sinh giới thiệu"
            hint="Nếu con được một bạn đang học ở ScienceHub giới thiệu, ghi mã học sinh của bạn đó (dạng HS0123). Không có thì để trống."
            error={errors.referrer_code}
          >
            <input
              id="referrer_code"
              className={inputClass(errors.referrer_code)}
              value={form.referrer_code}
              onChange={(e) => setField('referrer_code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="HS0123"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
            />
          </Field>
          <Field id="note" label="Ghi chú cho thầy" hint="Ví dụ: học lực hiện tại, mục tiêu, thời gian muốn bắt đầu học." error={errors.note}>
            <textarea
              id="note"
              className={`${inputClass(errors.note)} min-h-24 py-2`}
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </Field>
        </div>
        {/* Ô bẫy chống spam: ẩn với người dùng và trình đọc màn hình; máy gửi tự động thường điền vào. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setField('website', e.target.value)} />
        </div>
      </section>

      <div className={CARD}>
        <label className="flex cursor-pointer items-start gap-3 text-base text-slate-700">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-sky-600"
            checked={form.consent}
            onChange={(e) => setField('consent', e.target.checked)}
          />
          <span>
            Tôi đồng ý để ScienceHub dùng thông tin trên để liên hệ tư vấn và xếp lớp cho con (xem{' '}
            <a href="/bao-mat" className="font-medium text-sky-700 hover:underline">
              Chính sách bảo mật
            </a>
            ).<span className="text-red-500"> *</span>
          </span>
        </label>
        {errors.consent && <p className="mt-1 text-sm text-red-600">{errors.consent}</p>}

        {submitError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 text-base font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <CalendarCheck size={18} aria-hidden="true" />}
          {busy ? 'Đang gửi…' : 'Gửi đăng ký'}
        </button>
      </div>
    </form>
  )
}

function SchedulePicker({ section, today, pick, onChange, error }) {
  const options = sectionOptions(section)
  const option = options.find((o) => o.key === pick.option) ?? null
  const style = subjectStyle(section.subject)
  const chosenText =
    option?.type === 'group'
      ? option.group.parts
          .map((part) => part.classes.find((c) => c.id === pick.parts?.[part.part]))
          .filter(Boolean)
          .map((c) => splitSchedule(c.schedules ?? [], today).current.map((r) => sessionText(r)).join(', '))
      : []

  return (
    <fieldset className={`rounded-xl border-2 p-4 ${error ? 'border-red-300' : 'border-slate-200'}`}>
      <legend className="px-1 text-base font-bold text-slate-800">
        <span className={`mr-2 rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.tag}`}>{section.subject}</span>
        Lớp {section.grade}
      </legend>

      {options.length > 1 && (
        <div className="mb-3 space-y-2" role="radiogroup" aria-label={`Cách học ${section.subject} ${section.grade}`}>
          {options.map((o) => (
            <RadioCard
              key={o.key}
              name={`option-${section.key}`}
              checked={pick.option === o.key}
              onChange={() => onChange(withDefaultParts({ option: o.key, parts: {} }, o))}
              title={o.type === 'group' ? `Học theo ${o.group.parts.length} phần (${o.group.parts.length} buổi/tuần)` : classLabel(o.cls)}
              text={o.type === 'group' ? 'Mỗi phần chọn 1 ca ở bên dưới' : scheduleText(o.cls, today)}
            />
          ))}
        </div>
      )}

      {option?.type === 'single' && options.length === 1 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <b>{classLabel(option.cls)}</b> · {scheduleText(option.cls, today)}
        </p>
      )}

      {option?.type === 'group' && (
        <div className="space-y-3">
          <p className="text-sm text-sky-900">
            Mỗi tuần con học {option.group.parts.length} buổi: <b>chọn 1 ca trong mỗi phần</b>.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {option.group.parts.map((part) => (
              <div key={part.part} className="overflow-hidden rounded-lg border border-sky-300" role="radiogroup" aria-label={`Phần ${part.part}`}>
                <p className="bg-sky-600 px-3 py-1.5 text-sm font-bold text-white">
                  Phần {part.part} · {part.classes.length > 1 ? `chọn 1 trong ${part.classes.length} ca` : '1 ca'}
                </p>
                <div className="space-y-2 p-2">
                  {part.classes.map((cls) => (
                    <RadioCard
                      key={cls.id}
                      name={`part-${section.key}-${part.part}`}
                      checked={pick.parts?.[part.part] === cls.id}
                      onChange={() => onChange({ option: pick.option, parts: { ...pick.parts, [part.part]: cls.id } })}
                      title={classLabel(cls)}
                      text={scheduleText(cls, today)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {chosenText.length === option.group.parts.length && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Lịch của con: {chosenText.join(' + ')}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </fieldset>
  )
}

function RadioCard({ name, checked, onChange, title, text }) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-300 ${
        checked ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <input type="radio" name={name} className="h-5 w-5 shrink-0 accent-sky-600" checked={checked} onChange={onChange} />
      <span className="min-w-0">
        <span className="block font-semibold text-slate-800">{title}</span>
        <span className="block text-sm text-slate-600">{text}</span>
      </span>
    </label>
  )
}
