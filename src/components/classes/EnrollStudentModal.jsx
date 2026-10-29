import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, ArrowLeft } from 'lucide-react'
import Modal from '../Modal'
import FormField from '../FormField'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { fetchAll } from '../../lib/fetchAll'
import { normalizeText, compareVietnameseNames } from '../../lib/text'
import { monthStartISO, todayISO } from '../../lib/schedule'
import { classGrade } from '../../lib/grade'
import { canAutoFocus } from '../../lib/pointer'
import { classTitle } from '../../lib/dashboard'
import {
  normalizePhone,
  isValidPhone,
  validatePhone,
  validateRequired,
} from '../../lib/validators'

// Danh sách học sinh để chọn một em (radio). Học sinh đã học lớp này bị khóa.
function StudentPickList({ students, selectedId, onSelect, activeHere, activeCounts, parentOf, blocked }) {
  return (
    <div
      role="radiogroup"
      aria-label="Danh sách học sinh"
      className="max-h-64 overflow-y-auto rounded-lg border border-slate-200"
    >
      <ul className="divide-y divide-slate-100">
        {students.map((student) => {
          const inThisClass = activeHere.has(student.id)
          const blockReason = blocked.get(student.id) ?? ''
          const disabled = inThisClass || Boolean(blockReason)
          const parent = parentOf(student)
          let status = ''
          if (inThisClass) status = 'Đang học lớp này'
          else if (blockReason) status = blockReason
          else if (student.deleted_at) status = 'Đã ẩn, sẽ tự hiện lại khi thêm vào lớp'
          else status = `Đang học ${activeCounts[student.id] ?? 0} lớp`

          return (
            <li key={student.id}>
              <label
                className={`flex min-h-11 items-center gap-3 px-3 py-2 text-sm ${
                  disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50'
                } ${selectedId === student.id ? 'bg-sky-50' : ''}`}
              >
                <input
                  type="radio"
                  name="enroll-student"
                  value={student.id}
                  disabled={disabled}
                  checked={selectedId === student.id}
                  onChange={() => onSelect(student.id)}
                  className="h-4 w-4"
                />
                <span className="flex-1">
                  <span className="font-medium">{student.full_name}</span>
                  <span className="ml-2 text-slate-500">{student.student_code}</span>
                  {parent && (
                    <span className="block text-xs text-slate-500">
                      Phụ huynh: {parent.full_name} · {parent.phone}
                    </span>
                  )}
                  <span
                    className={`block text-xs ${blockReason ? 'text-red-600' : student.deleted_at && !inThisClass ? 'text-amber-700' : 'text-slate-500'}`}
                  >
                    {status}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Hộp thoại thêm học sinh vào một lớp.
//  - Tab "Theo SĐT phụ huynh": đối chiếu với phụ huynh đã có (kể cả đã ẩn). Trùng thì hiện
//    danh sách con để chọn (học sinh ẩn tự hiện lại). Muốn thêm một em CHƯA TỪNG học thì
//    bấm "Thêm con mới", em đó được tạo mới và gắn vào đúng phụ huynh.
//  - Tab "Tìm học sinh": tìm theo tên, mã, SĐT học sinh hoặc SĐT phụ huynh.
//  onDone(message) được gọi sau khi lưu thành công.
export default function EnrollStudentModal({ cls, isTeacher = false, onDone, onClose }) {
  const today = todayISO()
  // Giáo viên chỉ được chọn ngày vào lớp từ đầu tháng hiện tại (Database cũng chặn).
  const minJoined = isTeacher ? monthStartISO() : undefined
  const [data, setData] = useState(null) // { students, parents, enrollments } (cho tab Tìm học sinh)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('parent')
  const [parentPhone, setParentPhone] = useState('')
  const [lookup, setLookup] = useState({ phone: '', parent: null, error: '' })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(false)
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [parentName, setParentName] = useState('')
  const [joinedAt, setJoinedAt] = useState(today)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Tải theo trang: Supabase chỉ trả tối đa 1000 dòng mỗi truy vấn.
      const [studentResult, parentResult, enrollResult] = await Promise.all([
        fetchAll(() => supabase.from('students').select('id, student_code, full_name, phone, parent_id, deleted_at')),
        fetchAll(() => supabase.from('parents').select('id, parent_code, full_name, phone, deleted_at')),
        fetchAll(() =>
          supabase
            .from('class_enrollments')
            .select('id, class_id, student_id, classes(name, subject, grade, class_no)')
            .eq('status', 'active'),
        ),
      ])
      if (cancelled) return
      const error = studentResult.error || parentResult.error || enrollResult.error
      if (error) setLoadError(toVietnameseError(error))
      else {
        setData({
          students: studentResult.data,
          parents: parentResult.data,
          enrollments: enrollResult.data,
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const parentById = useMemo(
    () => new Map((data?.parents ?? []).map((parent) => [parent.id, parent])),
    [data],
  )
  const activeHere = useMemo(
    () => new Set((data?.enrollments ?? []).filter((row) => row.class_id === cls.id).map((row) => row.student_id)),
    [data, cls.id],
  )
  const activeCounts = useMemo(() => {
    const counts = {}
    for (const row of data?.enrollments ?? []) counts[row.student_id] = (counts[row.student_id] ?? 0) + 1
    return counts
  }, [data])
  const parentOf = (student) => parentById.get(student.parent_id) ?? null

  // Chặn học sinh đang học lớp khác khối với lớp này (Database cũng chặn cứng).
  const targetGrade = classGrade(cls)
  const blocked = useMemo(() => {
    const map = new Map()
    if (!targetGrade) return map
    for (const row of data?.enrollments ?? []) {
      if (row.class_id === cls.id) continue
      const otherGrade = classGrade(row.classes ? { ...row.classes } : null)
      if (otherGrade && otherGrade !== targetGrade && !map.has(row.student_id)) {
        map.set(
          row.student_id,
          `Đang học lớp ${row.classes ? classTitle(row.classes) : ''} (khối ${otherGrade}), không cùng khối ${targetGrade} của lớp này`,
        )
      }
    }
    return map
  }, [data, cls.id, targetGrade])

  // Tab SĐT phụ huynh: tra cứu qua RPC lookup_parent_by_phone (chỉ khớp chính xác 10 số).
  // Giáo viên không đọc được phụ huynh/học sinh của lớp khác qua RLS nên mọi vai trò đều dùng RPC này.
  const normalizedParentPhone = normalizePhone(parentPhone)
  const parentPhoneValid = isValidPhone(normalizedParentPhone)

  useEffect(() => {
    if (!parentPhoneValid) return undefined
    let cancelled = false
    supabase.rpc('lookup_parent_by_phone', { p_phone: normalizedParentPhone }).then(({ data: found, error }) => {
      if (cancelled) return
      setLookup({
        phone: normalizedParentPhone,
        parent: error ? null : (found ?? null),
        error: error ? toVietnameseError(error) : '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [parentPhoneValid, normalizedParentPhone])

  const lookupLoading = parentPhoneValid && lookup.phone !== normalizedParentPhone
  const matchedParent = parentPhoneValid && lookup.phone === normalizedParentPhone ? lookup.parent : null
  const lookupError = parentPhoneValid && lookup.phone === normalizedParentPhone ? lookup.error : ''

  const children = useMemo(
    () =>
      [...(matchedParent?.students ?? [])].sort((a, b) => compareVietnameseNames(a.full_name, b.full_name)),
    [matchedParent],
  )
  const childActiveHere = useMemo(
    () => new Set(children.filter((child) => (child.class_ids ?? []).includes(cls.id)).map((child) => child.id)),
    [children, cls.id],
  )
  const childCounts = useMemo(() => {
    const counts = {}
    for (const child of children) counts[child.id] = Number(child.active_class_count) || 0
    return counts
  }, [children])
  // Em đang học lớp khác khối (theo khối đã lưu của học sinh) thì khóa chọn; Database cũng chặn cứng.
  const childBlocked = useMemo(() => {
    const map = new Map()
    if (!targetGrade) return map
    for (const child of children) {
      if ((Number(child.active_class_count) || 0) > 0 && child.grade && Number(child.grade) !== targetGrade) {
        map.set(
          child.id,
          `Đang học khối ${child.grade}, không cùng khối ${targetGrade} của lớp này. Hãy cho em nghỉ các lớp khối cũ trước.`,
        )
      }
    }
    return map
  }, [children, targetGrade])

  // Hiện form học sinh mới khi: SĐT hợp lệ nhưng chưa có phụ huynh, hoặc bấm "Thêm con mới"
  const showNewForm =
    tab === 'parent' && parentPhoneValid && !lookupLoading && !lookupError && (!matchedParent || creating)
  const lockParentName = Boolean(matchedParent)

  // Tab tìm học sinh
  const searchResults = useMemo(() => {
    const keyword = normalizeText(query)
    return (data?.students ?? [])
      .filter((student) => {
        if (!keyword) return true
        const parent = parentById.get(student.parent_id)
        return normalizeText(
          [student.full_name, student.student_code, student.phone, parent?.phone, parent?.full_name].join(' '),
        ).includes(keyword)
      })
      .sort((a, b) => compareVietnameseNames(a.full_name, b.full_name))
  }, [data, query, parentById])

  function switchTab(next) {
    setTab(next)
    setSelectedId('')
    setCreating(false)
    setErrors({})
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (!joinedAt) {
      setFormError('Vui lòng chọn ngày vào lớp.')
      return
    }
    if (joinedAt > today) {
      setFormError('Ngày vào lớp không được ở tương lai.')
      return
    }
    if (minJoined && joinedAt < minJoined) {
      setFormError('Giáo viên chỉ được chọn ngày vào lớp trong tháng hiện tại.')
      return
    }

    if (showNewForm) {
      const nextErrors = {
        studentName: validateRequired(studentName, 'Vui lòng nhập họ tên học sinh.'),
        studentPhone: validatePhone(studentPhone),
        parentName: lockParentName ? '' : validateRequired(parentName, 'Vui lòng nhập họ tên phụ huynh.'),
      }
      setErrors(nextErrors)
      if (Object.values(nextErrors).some(Boolean)) return

      setSaving(true)
      const { error } = await supabase.rpc('register_student_in_class', {
        p_class_id: cls.id,
        p_joined_at: joinedAt,
        p_full_name: studentName.trim(),
        p_phone: normalizePhone(studentPhone) || null,
        p_parent_name: (lockParentName ? matchedParent.full_name : parentName).trim(),
        p_parent_phone: normalizedParentPhone,
      })
      setSaving(false)
      if (error) {
        setFormError(toVietnameseError(error))
        return
      }
      onDone(`Trung tâm đã đăng ký học sinh ${studentName.trim()} và thêm vào lớp ${classTitle(cls)}.`)
      return
    }

    if (!selectedId) {
      setFormError('Vui lòng chọn học sinh.')
      return
    }
    // Chọn từ danh sách con (tab SĐT phụ huynh, dữ liệu từ RPC) hoặc từ tab Tìm học sinh.
    const student =
      tab === 'parent'
        ? children.find((item) => item.id === selectedId)
        : data.students.find((item) => item.id === selectedId)
    const blockedMap = tab === 'parent' ? childBlocked : blocked
    if (blockedMap.has(selectedId)) {
      setFormError(blockedMap.get(selectedId))
      return
    }
    setSaving(true)
    // Học lại sau khi nghỉ vẫn là ghi danh mới (INSERT), không sửa dòng 'dropped' cũ.
    // Ghi danh đi qua RPC để Giáo viên (chỉ có quyền đọc) cũng thực hiện được.
    const { error } = await supabase.rpc('enroll_existing_student', {
      p_class_id: cls.id,
      p_student_id: selectedId,
      p_joined_at: joinedAt,
    })
    setSaving(false)
    if (error) {
      setFormError(toVietnameseError(error))
      return
    }
    onDone(
      student?.deleted_at
        ? `Trung tâm đã thêm ${student.full_name} vào lớp ${classTitle(cls)}. Học sinh và phụ huynh đã được hiện lại.`
        : `Trung tâm đã thêm ${student?.full_name ?? 'học sinh'} vào lớp ${classTitle(cls)}.`,
    )
  }

  const tabClass = (active) =>
    `min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors ${
      active ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`

  let content
  if (loadError) content = <Notice type="error">{loadError}</Notice>
  else if (!data) content = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách học sinh...</p>
  else {
    content = (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Notice type="error">{formError}</Notice>}

        <div className="flex gap-2">
          <button type="button" className={tabClass(tab === 'parent')} onClick={() => switchTab('parent')}>
            Theo SĐT phụ huynh
          </button>
          <button type="button" className={tabClass(tab === 'search')} onClick={() => switchTab('search')}>
            Tìm học sinh
          </button>
        </div>

        {tab === 'parent' && (
          <>
            <FormField
              id="enroll-parent-phone"
              label="Số điện thoại phụ huynh"
              type="tel"
              inputMode="numeric"
              autoFocus
              value={parentPhone}
              onChange={(value) => {
                setParentPhone(value)
                setSelectedId('')
                setCreating(false)
              }}
              hint="Nhập đủ 10 chữ số. Trung tâm sẽ đối chiếu với phụ huynh đã có."
              placeholder="0901234567"
            />

            {lookupLoading && <p className="text-sm text-slate-500">Trung tâm đang đối chiếu số điện thoại...</p>}
            {lookupError && <Notice type="error">{lookupError}</Notice>}

            {parentPhoneValid && matchedParent && !creating && (
              <>
                <Notice type="info">
                  Phụ huynh <strong>{matchedParent.full_name}</strong> ({matchedParent.parent_code}) đã có trong
                  Trung tâm
                  {matchedParent.deleted_at ? ', đang ẩn và sẽ tự hiện lại khi thêm con vào lớp' : ''}. Chọn một em
                  đã có thông tin, hoặc thêm con mới nếu em chưa từng học ở Trung tâm.
                </Notice>
                {children.length === 0 ? (
                  <p className="text-sm text-slate-500">Phụ huynh này chưa có học sinh nào.</p>
                ) : (
                  <StudentPickList
                    students={children}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    activeHere={childActiveHere}
                    activeCounts={childCounts}
                    parentOf={() => null}
                    blocked={childBlocked}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true)
                    setSelectedId('')
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-300 px-4 text-sm font-medium text-sky-700 hover:bg-sky-50"
                >
                  <UserPlus size={16} aria-hidden="true" />
                  Thêm con mới của phụ huynh này
                </button>
              </>
            )}

            {showNewForm && (
              <fieldset className="space-y-4 rounded-xl bg-slate-50 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-700">Học sinh mới</legend>
                {matchedParent && (
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-sky-700"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Quay lại danh sách con
                  </button>
                )}
                <FormField
                  id="new-student-name"
                  label="Họ tên học sinh"
                  required
                  value={studentName}
                  onChange={setStudentName}
                  error={errors.studentName}
                  placeholder="Ví dụ: Nguyễn Minh Anh"
                />
                <FormField
                  id="new-student-phone"
                  label="Số điện thoại học sinh"
                  type="tel"
                  inputMode="numeric"
                  value={studentPhone}
                  onChange={setStudentPhone}
                  error={errors.studentPhone}
                  hint="Không bắt buộc. 10 chữ số, không trùng với học sinh khác."
                  placeholder="0987654321"
                />
                <FormField
                  id="new-parent-name"
                  label="Họ tên phụ huynh"
                  required
                  value={lockParentName ? matchedParent.full_name : parentName}
                  onChange={setParentName}
                  error={errors.parentName}
                  disabled={lockParentName}
                  placeholder="Ví dụ: Nguyễn Văn Minh"
                />
              </fieldset>
            )}
          </>
        )}

        {tab === 'search' && (
          <>
            <div>
              <label htmlFor="enroll-search" className="mb-1 block text-sm font-medium text-slate-700">
                Tìm theo tên, mã, SĐT học sinh hoặc SĐT phụ huynh
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="enroll-search"
                  type="search"
                  autoFocus={canAutoFocus()}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ví dụ: Minh Anh, HS0001 hoặc 0901234567"
                  className="min-h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
                />
              </div>
            </div>
            {searchResults.length === 0 ? (
              <p className="rounded-lg border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Không có học sinh phù hợp.
              </p>
            ) : (
              <StudentPickList
                students={searchResults}
                selectedId={selectedId}
                onSelect={setSelectedId}
                activeHere={activeHere}
                activeCounts={activeCounts}
                parentOf={parentOf}
                blocked={blocked}
              />
            )}
          </>
        )}

        <div>
          <label htmlFor="enroll-joined" className="mb-1 block text-sm font-medium text-slate-700">
            Ngày vào lớp
          </label>
          <input
            id="enroll-joined"
            type="date"
            value={joinedAt}
            min={minJoined}
            max={today}
            onChange={(event) => setJoinedAt(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Mặc định là hôm nay, có thể chọn ngày trong quá khứ. Ngày này dùng để đếm học sinh mới trong tháng.
          </p>
        </div>

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
            {saving ? 'Đang lưu...' : showNewForm ? 'Đăng ký và thêm vào lớp' : 'Thêm vào lớp'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title={`Thêm học sinh vào lớp ${classTitle(cls)}`} onClose={onClose}>
      {content}
    </Modal>
  )
}
