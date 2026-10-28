import { useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import SelectField from '../SelectField'
import { compareVietnameseNames } from '../../lib/text'
import { planTeacherChange } from '../../lib/className'

// Hộp thoại nhỏ chọn giáo viên khác khi KHÔI PHỤC lớp mà giáo viên cũ đang bị ẩn.
// Không đụng tới môn, khối, lịch học, đơn giá.
//   onConfirm(teacherId, plan) -> câu báo lỗi hoặc ''
export default function ChangeTeacherDialog({ cls, oldTeacherName, teachers, takenNames, onConfirm, onClose }) {
  const [teacherId, setTeacherId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sorted = [...teachers].sort((a, b) => compareVietnameseNames(a.full_name, b.full_name))
  const teacher = teachers.find((item) => item.id === teacherId)
  const plan = teacher ? planTeacherChange({ cls, teacherName: teacher.full_name, takenNames }) : null
  const legacyName = !cls.subject || !cls.grade

  async function handleSubmit(event) {
    event.preventDefault()
    if (!teacher) {
      setError('Vui lòng chọn giáo viên phụ trách.')
      return
    }
    setSaving(true)
    setError('')
    const message = await onConfirm(teacher.id, plan)
    setSaving(false)
    if (message) setError(message)
  }

  return (
    <Modal title="Chọn giáo viên để khôi phục lớp" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Lớp <strong>{cls.name}</strong> đang được phụ trách bởi{' '}
          <strong>{oldTeacherName || 'một giáo viên chưa xác định'}</strong>, giáo viên này hiện đang bị ẩn.
          Hãy chọn giáo viên khác để khôi phục lớp. Môn học, khối, lịch học và đơn giá giữ nguyên.
        </p>

        {error && <Notice type="error">{error}</Notice>}

        <SelectField
          id="change-teacher"
          label="Giáo viên phụ trách"
          required
          value={teacherId}
          onChange={setTeacherId}
          placeholder="Chọn giáo viên"
        >
          {sorted.map((item) => (
            <option key={item.id} value={item.id}>
              {item.full_name}
            </option>
          ))}
        </SelectField>

        {plan && (
          <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm">
            <span className="text-slate-500">Tên lớp sau khi khôi phục: </span>
            <span className="break-all font-semibold text-sky-700">{plan.name}</span>
            {legacyName && (
              <p className="mt-1 text-xs text-slate-500">
                Lớp này chưa có môn và khối nên giữ nguyên tên. Sau khi khôi phục, bấm Sửa để đặt tên theo quy tắc.
              </p>
            )}
          </div>
        )}

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
            {saving ? 'Đang lưu...' : 'Khôi phục lớp'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
