import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '../Modal'
import FormField from '../FormField'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { classTitle } from '../../lib/dashboard'
import { compareVietnameseNames, normalizeText } from '../../lib/text'
import {
  MAX_PARTS,
  assignmentFromGroup,
  classGroupNames,
  partsFromAssignment,
} from '../../lib/classGroups'

const BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium disabled:opacity-50'

// Form tạo / sửa một nhóm lớp: đặt tên, chọn số phần, xếp từng lớp vào một phần.
function GroupForm({ group, groups, classes, teacherById, activeCounts, onSaved, onBack }) {
  const initial = useMemo(() => (group ? assignmentFromGroup(group) : { assignment: {}, partCount: 2 }), [group])
  const [name, setName] = useState(group?.name ?? '')
  const [partCount, setPartCount] = useState(initial.partCount)
  const [assignment, setAssignment] = useState(initial.assignment)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const otherGroup = useMemo(() => classGroupNames(groups, group?.id ?? null), [groups, group])

  // Lớp chọn được: lớp đang hiển thị, cộng lớp đã ẩn nhưng vốn thuộc nhóm này. Lớp đã xếp lên đầu.
  const rows = useMemo(() => {
    const keyword = normalizeText(query)
    return classes
      .filter((cls) => !cls.deleted_at || assignment[cls.id])
      .filter((cls) => {
        if (assignment[cls.id] || !keyword) return true
        const teacher = teacherById.get(cls.teacher_id)?.full_name ?? ''
        return normalizeText([cls.name, classTitle(cls), teacher].join(' ')).includes(keyword)
      })
      .sort(
        (a, b) =>
          (assignment[a.id] ?? 99) - (assignment[b.id] ?? 99) || compareVietnameseNames(a.name, b.name),
      )
  }, [classes, assignment, query, teacherById])

  function setPart(classId, value) {
    setAssignment((current) => {
      const next = { ...current }
      if (value) next[classId] = Number(value)
      else delete next[classId]
      return next
    })
  }

  function removeLastPart() {
    setAssignment((current) =>
      Object.fromEntries(Object.entries(current).filter(([, partNo]) => partNo < partCount)),
    )
    setPartCount((count) => count - 1)
  }

  const summary = Array.from({ length: partCount }, (_, index) => {
    const ids = Object.keys(assignment).filter((id) => assignment[id] === index + 1)
    const total = ids.reduce((sum, id) => sum + (activeCounts[id] ?? 0), 0)
    return { partNo: index + 1, count: ids.length, total }
  })

  async function handleSave(event) {
    event.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Vui lòng nhập tên nhóm lớp.')
      return
    }
    const built = partsFromAssignment(assignment, partCount)
    if (built.error) {
      setError(built.error)
      return
    }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('save_class_group', {
      p_group_id: group?.id ?? null,
      p_name: name.trim(),
      p_parts: built.parts,
    })
    setSaving(false)
    if (rpcError) {
      setError(toVietnameseError(rpcError))
      return
    }
    onSaved(`Trung tâm đã ${group ? 'cập nhật' : 'tạo'} nhóm lớp "${name.trim()}".`)
  }

  return (
    <form onSubmit={handleSave} noValidate className="space-y-4">
      <button type="button" onClick={onBack} className={`${BTN} -ml-2 px-2 text-sky-700 hover:bg-sky-50`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Danh sách nhóm lớp
      </button>
      {error && <Notice type="error">{error}</Notice>}

      <FormField
        id="class-group-name"
        label="Tên nhóm lớp"
        required
        autoFocus
        value={name}
        onChange={setName}
        placeholder="Ví dụ: Vật Lí 12 cô Lan"
      />

      <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-slate-600">
          Xếp các lớp <strong>dạy cùng nội dung</strong> vào cùng một phần. Học sinh không được học hai lớp cùng
          phần. Mỗi học sinh nên học đúng một lớp của mỗi phần, thiếu thì Trung tâm cảnh báo.
        </p>
        <ul className="space-y-0.5">
          {summary.map((part) => (
            <li key={part.partNo}>
              <span className="font-medium text-slate-800">Phần {part.partNo}</span>: {part.count} lớp, hiện có{' '}
              {part.total} lượt học sinh
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPartCount((count) => count + 1)}
            disabled={partCount >= MAX_PARTS}
            className={`${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <Plus size={16} aria-hidden="true" />
            Thêm phần
          </button>
          <button
            type="button"
            onClick={removeLastPart}
            disabled={partCount <= 1}
            className={`${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            Bớt Phần {partCount}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm lớp theo tên, môn, khối hoặc giáo viên"
          aria-label="Tìm lớp"
          className="min-h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
        />
      </div>

      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Không có lớp phù hợp.</li>}
        {rows.map((cls) => {
          const taken = otherGroup.get(cls.id)
          return (
            <li key={cls.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${assignment[cls.id] ? 'bg-sky-50' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">{classTitle(cls)}</span>
                <span className="block text-xs text-slate-500">
                  {cls.name} · {teacherById.get(cls.teacher_id)?.full_name ?? 'Chưa gắn giáo viên'} ·{' '}
                  {activeCounts[cls.id] ?? 0} học sinh{cls.deleted_at ? ' · đã ẩn' : ''}
                </span>
                {taken && <span className="block text-xs text-amber-700">Đã thuộc nhóm "{taken}"</span>}
              </span>
              <select
                value={assignment[cls.id] ?? ''}
                onChange={(event) => setPart(cls.id, event.target.value)}
                disabled={Boolean(taken)}
                aria-label={`Phần của lớp ${cls.name}`}
                className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 sm:text-sm"
              >
                <option value="">Không thuộc nhóm</option>
                {Array.from({ length: partCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Phần {index + 1}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className={`${BTN} border border-slate-300 text-slate-700 hover:bg-slate-50`}
        >
          Hủy
        </button>
        <button type="submit" disabled={saving} className={`${BTN} bg-sky-500 text-white hover:bg-sky-600`}>
          {saving ? 'Đang lưu...' : 'Lưu nhóm lớp'}
        </button>
      </div>
    </form>
  )
}

// Hộp thoại Nhóm lớp (chỉ Quản lý): danh sách nhóm, tạo / sửa / xóa.
//   classes: mọi lớp (kể cả đã ẩn); teacherById: Map id -> giáo viên; activeCounts: sĩ số đang học theo lớp.
//   onChanged(message): gọi sau khi lưu hoặc xóa để trang Lớp học tải lại cảnh báo.
export default function ClassGroupsModal({ classes, teacherById, activeCounts, onChanged, onClose }) {
  const [groups, setGroups] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(null) // null: danh sách; { group }: form (group null = tạo mới)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('class_groups_overview').then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError(toVietnameseError(error))
      else {
        setGroups(data ?? [])
        setLoadError('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function afterChange(message) {
    setNotice({ type: 'success', text: message })
    setEditing(null)
    setReloadKey((key) => key + 1)
    onChanged(message)
  }

  async function confirmDelete() {
    setBusy(true)
    const { error } = await supabase.rpc('delete_class_group', { p_group_id: deleting.id })
    setBusy(false)
    const name = deleting.name
    setDeleting(null)
    if (error) setNotice({ type: 'error', text: toVietnameseError(error) })
    else afterChange(`Trung tâm đã xóa nhóm lớp "${name}". Lớp và học sinh không thay đổi.`)
  }

  let content
  if (loadError) content = <Notice type="error">{loadError}</Notice>
  else if (!groups) content = <p className="text-sm text-slate-500">Trung tâm đang tải nhóm lớp...</p>
  else if (editing) {
    content = (
      <GroupForm
        group={editing.group}
        groups={groups}
        classes={classes}
        teacherById={teacherById}
        activeCounts={activeCounts}
        onSaved={afterChange}
        onBack={() => setEditing(null)}
      />
    )
  } else {
    content = (
      <div className="space-y-4">
        {notice && (
          <Notice type={notice.type} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}
        {deleting && (
          <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alertdialog">
            <p>
              Xóa nhóm lớp <strong>{deleting.name}</strong>? Lớp, học sinh và điểm danh không thay đổi; chỉ bỏ ràng buộc
              không trùng học sinh và cảnh báo của nhóm này.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busy}
                className={`${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Hủy
              </button>
              <button type="button" onClick={confirmDelete} disabled={busy} className={`${BTN} bg-red-500 text-white hover:bg-red-600`}>
                {busy ? 'Đang xóa...' : 'Xóa nhóm'}
              </button>
            </div>
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate-600">
          Nhóm lớp gom các lớp dạy cùng nội dung bài học vào một phần, ví dụ phần 1 gồm lớp 1 và lớp 2, phần 2 gồm
          lớp 3 và lớp 4. Trung tâm không cho học sinh học hai lớp cùng phần, và cảnh báo em nào chưa học đủ các phần.
        </p>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Chưa có nhóm lớp nào.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {groups.map((group) => (
              <li key={group.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{group.name}</p>
                  <p className="text-xs text-slate-500">
                    {group.parts
                      .map((part) => `Phần ${part.part_no}: ${part.classes.map((cls) => classTitle(cls)).join(', ')}`)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing({ group })}
                    className={`${BTN} bg-slate-100 text-slate-700 hover:bg-slate-200`}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null)
                      setDeleting(group)
                    }}
                    className={`${BTN} bg-red-50 text-red-600 hover:bg-red-100`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setEditing({ group: null })
          }}
          className={`${BTN} bg-sky-500 text-white hover:bg-sky-600`}
        >
          <Layers size={16} aria-hidden="true" />
          Tạo nhóm lớp mới
        </button>
      </div>
    )
  }

  return (
    <Modal title={editing ? (editing.group ? 'Sửa nhóm lớp' : 'Tạo nhóm lớp') : 'Nhóm lớp'} onClose={onClose}>
      {content}
    </Modal>
  )
}
