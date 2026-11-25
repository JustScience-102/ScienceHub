import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Phone, RefreshCw, UserPlus } from 'lucide-react'
import PageShell from '../components/PageShell'
import Notice from '../components/Notice'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import FormActions from '../components/FormActions'
import SelectField from '../components/SelectField'
import EnrollStudentModal from '../components/classes/EnrollStudentModal'
import { BTN_PRIMARY, BTN_SECONDARY } from '../lib/buttonStyles'
import { supabase } from '../lib/supabaseClient'
import { toVietnameseError } from '../lib/errors'
import { REGISTRATION_STATUSES, countByStatus, formatDateTime, groupChoices, statusInfo } from '../lib/registrations'

// Đơn đăng ký học phụ huynh gửi từ trang sciencehub.id.vn (chỉ Quản lý; ARCHITECTURE.md mục 5.2).
// Đơn nằm ở schema riêng "website", không vào file sao lưu. "Xếp lớp" mở lần lượt hộp thoại Thêm học sinh vào từng lớp
// phụ huynh đã chọn (điền sẵn thông tin từ đơn); xếp xong mọi lớp thì đơn tự chuyển "Đã xếp lớp".
const FILTERS = [...REGISTRATION_STATUSES, { id: 'all', label: 'Tất cả' }]

export default function RegistrationsPage({ onChanged }) {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('new')
  const [notice, setNotice] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(null)
  const [enrolling, setEnrolling] = useState(null) // { request, queue: [cls], index, done }
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.rpc('list_registration_requests', { p_status: null }).then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError(toVietnameseError(error))
      else {
        setLoadError('')
        setItems(data ?? [])
      }
    })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => {
    setReloadKey((k) => k + 1)
    onChanged?.()
  }
  const counts = useMemo(() => countByStatus(items ?? []), [items])
  const shown = (items ?? []).filter((item) => filter === 'all' || item.status === filter)

  async function changeStatus(request, status, staffNote = null) {
    setBusyId(request.id)
    const { error } = await supabase.rpc('set_registration_status', {
      p_id: request.id,
      p_status: status,
      p_staff_note: staffNote,
    })
    setBusyId('')
    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
      return false
    }
    setNotice({ type: 'success', text: `Đơn của ${request.student_name}: ${statusInfo(status).label}.` })
    reload()
    return true
  }

  async function startEnroll(request) {
    setNotice(null)
    setBusyId(request.id)
    const ids = request.class_ids ?? []
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, subject, grade, class_no, deleted_at')
      .in('id', ids)
    setBusyId('')
    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
      return
    }
    // Giữ thứ tự phụ huynh chọn (môn, phần); bỏ lớp đã ẩn hoặc không còn.
    const byId = new Map((data ?? []).map((cls) => [cls.id, cls]))
    const order = (request.choices ?? []).map((c) => c.class_id)
    const queue = order.map((id) => byId.get(id)).filter((cls) => cls && !cls.deleted_at)
    if (queue.length === 0) {
      setNotice({ type: 'error', text: 'Các lớp phụ huynh chọn đều đã ẩn hoặc không còn. Hãy xếp lớp ở trang Học sinh.' })
      return
    }
    if (queue.length < order.length) {
      setNotice({ type: 'info', text: `Có ${order.length - queue.length} lớp phụ huynh chọn đã ẩn, sẽ bỏ qua.` })
    }
    setEnrolling({ request, queue, index: 0, done: 0 })
  }

  async function enrollStepDone() {
    const next = { ...enrolling, done: enrolling.done + 1 }
    if (next.index + 1 < next.queue.length) {
      setEnrolling({ ...next, index: next.index + 1 })
      return
    }
    setEnrolling(null)
    const ok = await changeStatus(next.request, 'enrolled')
    if (ok) {
      setNotice({
        type: 'success',
        text: `Đã xếp ${next.request.student_name} vào ${next.done} lớp. Đơn chuyển sang "Đã xếp lớp".`,
      })
    }
  }

  function enrollClosed() {
    const { request, done, queue } = enrolling
    setEnrolling(null)
    if (done > 0) {
      setNotice({
        type: 'info',
        text: `Đã xếp ${request.student_name} vào ${done}/${queue.length} lớp. Đơn giữ trạng thái cũ; các lớp còn lại có thể thêm ở trang Học sinh.`,
      })
      reload()
    }
  }

  let body
  if (loadError) body = <Notice type="error">{loadError}</Notice>
  else if (!items) body = <p className="text-sm text-slate-500">Trung tâm đang tải đơn đăng ký...</p>
  else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardList}
        title={filter === 'new' ? 'Chưa có đơn mới' : 'Không có đơn nào'}
        text="Đơn phụ huynh gửi ở trang Đăng ký học của sciencehub.id.vn sẽ hiện ở đây."
      />
    )
  } else {
    body = (
      <ul className="space-y-3">
        {shown.map((item) => (
          <RequestCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onEnroll={() => startEnroll(item)}
            onContacted={() => changeStatus(item, 'contacted')}
            onEdit={() => setEditing(item)}
          />
        ))}
      </ul>
    )
  }

  return (
    <PageShell
      title="Đơn đăng ký"
      description="Đơn phụ huynh gửi từ trang sciencehub.id.vn. Liên hệ phụ huynh, rồi bấm Xếp lớp để thêm học sinh vào các lớp đã chọn."
    >
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
              filter === f.id ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f.label}
            {items && <span className={filter === f.id ? 'text-sky-100' : 'text-slate-400'}>{counts[f.id] ?? 0}</span>}
          </button>
        ))}
        <button type="button" onClick={reload} className={`${BTN_SECONDARY} ml-auto`}>
          <RefreshCw size={16} aria-hidden="true" />
          Tải lại
        </button>
      </div>

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {body}

      {editing && (
        <StatusModal
          request={editing}
          onClose={() => setEditing(null)}
          onSave={async (status, note) => {
            const ok = await changeStatus(editing, status, note)
            if (ok) setEditing(null)
          }}
        />
      )}
      {enrolling && (
        <EnrollStudentModal
          key={`${enrolling.request.id}-${enrolling.index}`}
          cls={enrolling.queue[enrolling.index]}
          step={enrolling.queue.length > 1 ? `Lớp ${enrolling.index + 1}/${enrolling.queue.length}` : ''}
          initial={{
            parentPhone: enrolling.request.parent_phone,
            studentName: enrolling.request.student_name,
            studentPhone: enrolling.request.student_phone ?? '',
            parentName: enrolling.request.parent_name,
          }}
          onDone={enrollStepDone}
          onClose={enrollClosed}
        />
      )}
    </PageShell>
  )
}

function RequestCard({ item, busy, onEnroll, onContacted, onEdit }) {
  const status = statusInfo(item.status)
  const groups = groupChoices(item.choices)
  const open = item.status === 'new' || item.status === 'contacted'
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-slate-800">
            {item.student_name} <span className="font-normal text-slate-500">· Khối {item.grade}</span>
          </p>
          {item.school && <p className="text-sm text-slate-500">{item.school}</p>}
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
          <p className="mt-1 text-xs text-slate-500">
            Gửi {formatDateTime(item.created_at)}
            {item.updated_at && item.updated_at !== item.created_at && item.status === 'new'
              ? ` · sửa ${formatDateTime(item.updated_at)}`
              : ''}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Phụ huynh</dt>
          <dd className="text-slate-800">
            {item.parent_name} ·{' '}
            <a href={`tel:${item.parent_phone}`} className="font-medium text-sky-700 hover:underline">
              {item.parent_phone}
            </a>
          </dd>
        </div>
        {item.student_phone && (
          <div>
            <dt className="text-slate-500">SĐT học sinh</dt>
            <dd>
              <a href={`tel:${item.student_phone}`} className="font-medium text-sky-700 hover:underline">
                {item.student_phone}
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-slate-500">Học sinh giới thiệu</dt>
          <dd className="text-slate-800">
            {!item.referrer_code && <span className="text-slate-400">Không có</span>}
            {item.referrer_code && item.referrer && (
              <>
                <b>{item.referrer.code}</b> – {item.referrer.name}
                {!item.referrer.active && <span className="text-slate-500"> (đã nghỉ)</span>}
              </>
            )}
            {item.referrer_code && !item.referrer && (
              <>
                <b>{item.referrer_code}</b> <span className="text-slate-500">(không còn trong danh sách học sinh)</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {item.parent_match && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          SĐT này đã có trong app: phụ huynh <b>{item.parent_match.full_name}</b> ({item.parent_match.parent_code})
          {item.parent_match.children.length > 0 && (
            <>
              , con:{' '}
              {item.parent_match.children
                .map((c) => `${c.full_name} (${c.student_code}${c.active ? '' : ', đã nghỉ'})`)
                .join(', ')}
            </>
          )}
          .
        </p>
      )}

      <div className="mt-3 space-y-2">
        {groups.map((g) => (
          <div key={g.key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold text-slate-800">{g.title}</p>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {g.items.map((it) => (
                <li key={it.classId}>
                  {it.label}: {it.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {item.note && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="text-slate-500">Phụ huynh ghi chú:</span> {item.note}
        </p>
      )}
      {item.staff_note && (
        <p className="mt-1 text-sm text-slate-700">
          <span className="text-slate-500">Ghi chú của Trung tâm:</span> {item.staff_note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`tel:${item.parent_phone}`} className={BTN_SECONDARY}>
          <Phone size={16} aria-hidden="true" />
          Gọi phụ huynh
        </a>
        {open && (
          <button type="button" onClick={onEnroll} disabled={busy} className={BTN_PRIMARY}>
            <UserPlus size={16} aria-hidden="true" />
            Xếp lớp
          </button>
        )}
        {item.status === 'new' && (
          <button type="button" onClick={onContacted} disabled={busy} className={BTN_SECONDARY}>
            Đã liên hệ
          </button>
        )}
        <button type="button" onClick={onEdit} disabled={busy} className={BTN_SECONDARY}>
          Trạng thái & ghi chú
        </button>
      </div>
    </li>
  )
}

function StatusModal({ request, onClose, onSave }) {
  const [status, setStatus] = useState(request.status)
  const [note, setNote] = useState(request.staff_note ?? '')
  const [saving, setSaving] = useState(false)
  return (
    <Modal title={`Đơn của ${request.student_name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          await onSave(status, note)
          setSaving(false)
        }}
      >
        <SelectField id="registration-status" label="Trạng thái" value={status} onChange={setStatus}>
          {REGISTRATION_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <div>
          <label htmlFor="registration-note" className="mb-1 block text-sm font-medium text-slate-700">
            Ghi chú của Trung tâm
          </label>
          <textarea
            id="registration-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ví dụ: đã gọi, hẹn học thử thứ 7"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">Chỉ Quản lý thấy. Xóa hết chữ để bỏ ghi chú.</p>
        </div>
        <FormActions onCancel={onClose} busy={saving} />
      </form>
    </Modal>
  )
}
