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
export default function RegisterStudentFlow({ isTeacher = false, onDone, onClose }) {
  const [classes, setClasses] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [classId, setClassId] = useState('')
  const [picked, setPicked] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('classes')
      .select('id, name, subject, grade, deleted_at')
      .is('deleted_at', null)
      .then(({ data, error: loadFailure }) => {
        if (cancelled) return
        if (loadFailure) setLoadError(toVietnameseError(loadFailure))
        else setClasses(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(
    () => [...(classes ?? [])].sort((a, b) => compareVietnameseNames(a.name, b.name)),
    [classes],
  )

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
          placeholder="Chọn lớp"
        >
          {sorted.map((item) => (
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
