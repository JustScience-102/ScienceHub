import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import Notice from '../Notice'
import ClassPickList from './ClassPickList'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { monthStartISO, todayISO } from '../../lib/schedule'
import { buildClassChoices, loadClassChoices } from '../../lib/transfer'
import { classTitle } from '../../lib/dashboard'

// Hộp thoại ĐĂNG KÝ THÊM LỚP cho học sinh (giữ nguyên các lớp đang học, chỉ thêm lớp mới CÙNG KHỐI).
//  activeEnrollments: mọi ghi danh 'active' của học sinh (để xác định khối và bỏ các lớp đang học)
//  onDone(message): gọi sau khi lưu thành công
export default function AddClassModal({
  studentId,
  studentName,
  studentHidden,
  activeEnrollments,
  isTeacher = false,
  onDone,
  onClose,
}) {
  const today = todayISO()
  // Giáo viên chỉ được chọn ngày vào lớp từ đầu tháng hiện tại (Database cũng chặn).
  const minJoined = isTeacher ? monthStartISO() : undefined
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [joinedAt, setJoinedAt] = useState(today)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadClassChoices().then((result) => {
      if (cancelled) return
      if (result.error) setLoadError(result.error)
      else setData(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choices = useMemo(
    () => (data ? buildClassChoices({ classes: data.classes, activeEnrollments }).list : []),
    [data, activeEnrollments],
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!selectedId) {
      setFormError('Vui lòng chọn lớp muốn đăng ký.')
      return
    }
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

    setSaving(true)
    // Học lại sau khi đã nghỉ vẫn là ghi danh mới (INSERT), không sửa dòng 'dropped' cũ.
    // Ghi danh đi qua RPC để Giáo viên (chỉ có quyền đọc) cũng thực hiện được.
    const { error } = await supabase.rpc('enroll_existing_student', {
      p_class_id: selectedId,
      p_student_id: studentId,
      p_joined_at: joinedAt,
    })
    setSaving(false)
    if (error) {
      setFormError(toVietnameseError(error))
      return
    }
    const chosen = choices.find((item) => item.cls.id === selectedId)?.cls
    const className = chosen ? classTitle(chosen) : ''
    onDone(`Trung tâm đã đăng ký ${studentName} vào lớp ${className}.`)
  }

  let content
  if (loadError) content = <Notice type="error">{loadError}</Notice>
  else if (!data) content = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách lớp...</p>
  else {
    content = (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Trung tâm sẽ thêm <strong>{studentName}</strong> vào một lớp mới <strong>cùng khối</strong>. Các lớp đang học
          được giữ nguyên, học phí cộng dồn từ tất cả các lớp.
        </p>

        {studentHidden && (
          <Notice type="info">
            {studentName} đang bị ẩn vì chưa thuộc lớp nào. Học sinh và phụ huynh sẽ tự hiện lại khi được thêm vào lớp.
          </Notice>
        )}

        {formError && <Notice type="error">{formError}</Notice>}

        {choices.length === 0 ? (
          <Notice type="info">Hiện chưa có lớp nào khác để đăng ký.</Notice>
        ) : (
          <ClassPickList
            choices={choices}
            counts={data.counts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            idPrefix="add-class"
          />
        )}

        <div>
          <label htmlFor="add-class-joined" className="mb-1 block text-sm font-medium text-slate-700">
            Ngày vào lớp
          </label>
          <input
            id="add-class-joined"
            type="date"
            value={joinedAt}
            min={minJoined}
            max={today}
            onChange={(event) => setJoinedAt(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
          />
          <p className="mt-1 text-xs text-slate-500">
            Mặc định là hôm nay, có thể chọn ngày trong quá khứ nhưng không ở tương lai.
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
            disabled={saving || choices.length === 0}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Đăng ký lớp'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title={`Đăng ký thêm lớp cho ${studentName}`} onClose={onClose}>
      {content}
    </Modal>
  )
}
