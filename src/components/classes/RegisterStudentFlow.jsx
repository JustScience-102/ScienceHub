import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import SelectField from '../SelectField'
import EnrollStudentModal from './EnrollStudentModal'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { compareVietnameseNames } from '../../lib/text'
import { classTitle } from '../../lib/dashboard'

// Đăng ký học sinh từ trang Học sinh: BẮT BUỘC chọn lớp trước (mọi học sinh phải thuộc ít nhất
// một lớp), sau đó dùng chung hộp thoại thêm học sinh vào lớp.
//  onDone(message) được gọi sau khi lưu thành công.
//  Giáo viên (isTeacher): chỉ thấy lớp do mình phụ trách (teacherId), không có ô lọc Giáo viên.
export default function RegisterStudentFlow({ isTeacher = false, teacherId: ownTeacherId = null, onDone, onClose }) {
  const [classes, setClasses] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [classId, setClassId] = useState('')
  const [picked, setPicked] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('classes')
      .select('id, name, subject, grade, teacher_id, deleted_at, teachers(full_name)')
      .is('deleted_at', null)
      .then(({ data, error: loadFailure }) => {
        if (cancelled) return
        if (loadFailure) setLoadError(toVietnameseError(loadFailure))
        else setClasses(isTeacher ? data.filter((item) => item.teacher_id === ownTeacherId) : data)
      })
    return () => {
      cancelled = true
    }
  }, [isTeacher, ownTeacherId])

  const sorted = useMemo(
    () => [...(classes ?? [])].sort((a, b) => compareVietnameseNames(a.name, b.name)),
    [classes],
  )

  // Mỗi ô lọc chỉ liệt kê giá trị còn lớp phù hợp với hai ô lọc còn lại (không chọn ra tổ hợp rỗng).
  const matches = (item, skip) =>
    (skip === 'subject' || !subject || item.subject === subject) &&
    (skip === 'grade' || !grade || String(item.grade) === grade) &&
    (skip === 'teacher' || !teacherId || item.teacher_id === teacherId)

  const subjectOptions = useMemo(
    () => [...new Set(sorted.filter((item) => matches(item, 'subject') && item.subject).map((item) => item.subject))]
      .sort((a, b) => a.localeCompare(b, 'vi')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, grade, teacherId],
  )
  const gradeOptions = useMemo(
    () => [...new Set(sorted.filter((item) => matches(item, 'grade') && item.grade).map((item) => String(item.grade)))]
      .sort((a, b) => Number(a) - Number(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, subject, teacherId],
  )
  const teacherOptions = useMemo(() => {
    const map = new Map()
    for (const item of sorted) {
      if (matches(item, 'teacher') && item.teacher_id) {
        map.set(item.teacher_id, item.teachers?.full_name || 'Giáo viên chưa rõ tên')
      }
    }
    return [...map.entries()].sort((a, b) => compareVietnameseNames(a[1], b[1]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, subject, grade])
  const visibleClasses = useMemo(
    () => sorted.filter((item) => matches(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, subject, grade, teacherId],
  )

  // Đổi một ô lọc thì bỏ lớp đã chọn nếu lớp đó không còn khớp.
  function changeFilter(setter) {
    return (value) => {
      setter(value)
      setClassId('')
      setError('')
    }
  }

  if (picked) {
    return <EnrollStudentModal cls={picked} isTeacher={isTeacher} onDone={onDone} onClose={onClose} />
  }

  function handleNext(event) {
    event.preventDefault()
    const chosen = sorted.find((item) => item.id === classId)
    if (!chosen) {
      setError('Vui lòng chọn lớp cho học sinh.')
      return
    }
    setPicked(chosen)
  }

  let content
  if (loadError) content = <Notice type="error">{loadError}</Notice>
  else if (!classes) content = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách lớp...</p>
  else if (sorted.length === 0) {
    content = (
      <Notice type="info">
        Trung tâm chưa có lớp nào. Hãy tạo lớp ở trang Quản lý Lớp học trước, vì mỗi học sinh phải thuộc ít nhất
        một lớp.
      </Notice>
    )
  } else {
    content = (
      <form onSubmit={handleNext} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          Mỗi học sinh phải thuộc ít nhất một lớp. Hãy chọn lớp đầu tiên của học sinh, các lớp khác thêm sau ở trang
          Quản lý Lớp học.
        </p>
        <div className={`grid grid-cols-1 gap-3 ${isTeacher ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <SelectField
            id="register-subject"
            label="Môn"
            value={subject}
            onChange={changeFilter(setSubject)}
            placeholder="Tất cả môn"
          >
            {subjectOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="register-grade"
            label="Khối"
            value={grade}
            onChange={changeFilter(setGrade)}
            placeholder="Tất cả khối"
          >
            {gradeOptions.map((value) => (
              <option key={value} value={value}>
                Khối {value}
              </option>
            ))}
          </SelectField>
          {!isTeacher && (
            <SelectField
              id="register-teacher"
              label="Giáo viên"
              value={teacherId}
              onChange={changeFilter(setTeacherId)}
              placeholder="Tất cả giáo viên"
            >
              {teacherOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <SelectField
          id="register-class"
          label="Lớp"
          required
          value={classId}
          onChange={(value) => {
            setClassId(value)
            setError('')
          }}
          error={error}
          hint={`${visibleClasses.length} lớp phù hợp.`}
          placeholder="Chọn lớp"
        >
          {visibleClasses.map((item) => (
            <option key={item.id} value={item.id}>
              {classTitle(item)}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600"
          >
            Tiếp tục
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title="Đăng ký học sinh" onClose={onClose}>
      {content}
    </Modal>
  )
}
