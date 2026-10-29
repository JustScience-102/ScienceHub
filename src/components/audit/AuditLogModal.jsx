// Hộp thoại tra cứu Nhật ký thay đổi cho Quản lý (chỉ đọc, dữ liệu được bảo vệ toàn vẹn).
// Dùng phủ toàn màn hình riêng (không dùng Modal vì bảng cần rộng hơn), giữ đúng hành vi
// của Modal: đóng bằng Esc / nút X, khóa cuộn nền, role="dialog". Bảng trên máy tính, thẻ trên điện thoại.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, History, ShieldAlert, X } from 'lucide-react'
import EmptyState from '../EmptyState'
import FormField from '../FormField'
import Notice from '../Notice'
import SelectField from '../SelectField'
import MobileFilters from '../MobileFilters'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { todayISO } from '../../lib/schedule'
import { compareVietnameseNames } from '../../lib/text'
import {
  ACTION_GROUP_OPTIONS,
  describeAuditGroup,
  fetchAuditLogs,
  formatAuditPayload,
  formatVnDateTime,
  getActionMeta,
  getActorRoleLabel,
  getCurrentSchoolYearBounds,
  groupAuditItems,
} from '../../lib/auditLog'

const PAGE_SIZE = 100

function DetailTable({ title, items, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className={`mb-2 text-xs font-semibold ${tone}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Không có</p>
      ) : (
        <dl className="space-y-1">
          {items.map((field) => (
            <div key={field.key} className="flex justify-between gap-2 text-xs">
              <dt className="shrink-0 text-slate-500">{field.label}:</dt>
              <dd className="text-right font-medium text-slate-800">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function SingleDetail({ item }) {
  const oldList = formatAuditPayload(item.old_data)
  const newList = formatAuditPayload(item.new_data)
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <DetailTable title="Dữ liệu trước thay đổi" items={oldList} tone="text-slate-600" />
      <DetailTable title="Dữ liệu sau thay đổi" items={newList} tone="text-sky-700" />
    </div>
  )
}

function GroupDetail({ entry }) {
  return (
    <ul className="space-y-1.5">
      {entry.items.map((item) => (
        <li key={item.id} className="rounded-lg bg-white p-2.5 text-xs text-slate-700 ring-1 ring-slate-200">
          <p className="font-medium">{item.summary}</p>
          <p className="mt-0.5 text-slate-500">{formatVnDateTime(item.created_at)}</p>
        </li>
      ))}
    </ul>
  )
}

function entrySummary(entry) {
  return entry.kind === 'group' ? describeAuditGroup(entry) : entry.item.summary
}

function entryActor(entry) {
  const item = entry.kind === 'group' ? entry.head : entry.item
  return { name: item.actor_name, role: item.actor_role, time: item.created_at }
}

export default function AuditLogModal({
  onClose,
  initialClassId = null,
  initialClassName = '',
  initialStudentId = null,
  initialStudentName = '',
}) {
  const schoolYear = useMemo(() => getCurrentSchoolYearBounds(), [])
  const [fromDate, setFromDate] = useState(schoolYear.startDate)
  const [toDate, setToDate] = useState(todayISO())
  const [actorRole, setActorRole] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [actionGroup, setActionGroup] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [teachers, setTeachers] = useState([])
  const [results, setResults] = useState({ key: '', items: [], total: 0, error: '' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)
  const requestId = useRef(0)

  // Tìm kiếm đợi người dùng gõ xong mới gọi Database.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  // Đóng bằng phím Esc và khóa cuộn nền (giống Modal).
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // Giáo viên để lọc (Quản lý đọc được danh sách qua RLS).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('teachers').select('id, full_name').is('deleted_at', null)
      if (!cancelled && data) {
        setTeachers([...data].sort((a, b) => compareVietnameseNames(a.full_name, b.full_name)))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        fromDate,
        toDate,
        actorRole,
        teacherId,
        actionGroup,
        search: debouncedSearch,
        initialClassId,
        initialStudentId,
      }),
    [fromDate, toDate, actorRole, teacherId, actionGroup, debouncedSearch, initialClassId, initialStudentId],
  )

  // Tải lại từ đầu khi bộ lọc đổi; "Xem thêm" nối tiếp vào danh sách hiện có.
  useEffect(() => {
    let cancelled = false
    const id = (requestId.current += 1)
    async function load() {
      try {
        const data = await fetchAuditLogs({
          fromDate: fromDate || null,
          toDate: toDate || null,
          actorRole: actorRole || null,
          teacherId: teacherId || null,
          actionGroup: actionGroup || null,
          classId: initialClassId,
          studentId: initialStudentId,
          search: debouncedSearch || null,
          limit: PAGE_SIZE,
          offset: 0,
        })
        if (cancelled || requestId.current !== id) return
        setResults({ key: filtersKey, items: data.items || [], total: data.total || 0, error: '' })
        setExpandedKey(null)
      } catch (error) {
        if (cancelled || requestId.current !== id) return
        setResults({ key: filtersKey, items: [], total: 0, error: toVietnameseError(error) })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [filtersKey, fromDate, toDate, actorRole, teacherId, actionGroup, debouncedSearch, initialClassId, initialStudentId])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    const id = (requestId.current += 1)
    try {
      const data = await fetchAuditLogs({
        fromDate: fromDate || null,
        toDate: toDate || null,
        actorRole: actorRole || null,
        teacherId: teacherId || null,
        actionGroup: actionGroup || null,
        classId: initialClassId,
        studentId: initialStudentId,
        search: debouncedSearch || null,
        limit: PAGE_SIZE,
        offset: results.items.length,
      })
      if (requestId.current === id) {
        setResults((prev) => ({
          ...prev,
          items: [...prev.items, ...(data.items || [])],
          total: data.total ?? prev.total,
        }))
      }
    } catch {
      // Giữ danh sách đang hiển thị, không ghi đè lỗi lên toàn màn hình.
    } finally {
      if (requestId.current === id) setLoadingMore(false)
    }
  }

  const loading = results.key !== filtersKey
  const entries = useMemo(() => groupAuditItems(results.items), [results.items])
  const scopeLabel = initialClassName
    ? `Lớp ${initialClassName}`
    : initialStudentName
      ? `Học sinh ${initialStudentName}`
      : 'Toàn Trung tâm'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nhật ký thay đổi"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-5xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <History size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Nhật ký thay đổi · {scopeLabel}</h2>
              <p className="text-xs text-slate-500">{schoolYear.label} · Chỉ đọc, dữ liệu được bảo vệ toàn vẹn</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <MobileFilters
            id="audit-filters"
            activeCount={(actionGroup ? 1 : 0) + (actorRole ? 1 : 0) + (teacherId ? 1 : 0)}
          >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <FormField id="audit-from" label="Từ ngày" type="date" value={fromDate} onChange={setFromDate} />
            <FormField id="audit-to" label="Đến ngày" type="date" value={toDate} onChange={setToDate} />
            <SelectField
              id="audit-group"
              label="Loại thao tác"
              value={actionGroup}
              onChange={setActionGroup}
              placeholder="Tất cả thao tác"
            >
              {ACTION_GROUP_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="audit-role"
              label="Người thực hiện"
              value={actorRole}
              onChange={(value) => {
                setActorRole(value)
                if (value !== 'teacher') setTeacherId('')
              }}
              placeholder="Tất cả"
            >
              <option value="">Tất cả</option>
              <option value="manager">Quản lý</option>
              <option value="teacher">Giáo viên</option>
              <option value="system">Hệ thống</option>
            </SelectField>
            <SelectField
              id="audit-teacher"
              label="Giáo viên"
              value={teacherId}
              onChange={(value) => {
                setTeacherId(value)
                if (value) setActorRole('teacher')
              }}
              placeholder="Tất cả giáo viên"
            >
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name}
                </option>
              ))}
            </SelectField>
          </div>
          </MobileFilters>
          <FormField
            id="audit-search"
            label="Tìm kiếm"
            value={search}
            onChange={setSearch}
            placeholder="Tên học sinh, mã HS, tên lớp, người thực hiện..."
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {results.error ? (
            <Notice type="error">{results.error}</Notice>
          ) : loading && entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Trung tâm đang tải nhật ký thay đổi...</p>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Chưa có bản ghi nào"
              text="Chưa có bản ghi nhật ký nào khớp với bộ lọc hiện tại."
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500" aria-live="polite">
                Tìm thấy <strong className="text-slate-800">{results.total}</strong> bản ghi
                {results.items.length < results.total
                  ? ` (đang hiển thị ${results.items.length} bản ghi mới nhất)`
                  : ''}
              </p>

              <div className={`transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
                <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Thời gian</th>
                        <th className="px-3 py-3 font-semibold">Người thực hiện</th>
                        <th className="px-3 py-3 font-semibold">Thao tác</th>
                        <th className="px-3 py-3 font-semibold">Nội dung</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((entry) => {
                        const meta = getActionMeta(entry.kind === 'group' ? entry.action : entry.item.action)
                        const actor = entryActor(entry)
                        const expanded = expandedKey === entry.key
                        return (
                          <tr key={entry.key} className="align-top hover:bg-slate-50/60">
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                              {formatVnDateTime(actor.time)}
                              {entry.kind === 'group' && (
                                <span className="mt-1 block rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                  {entry.items.length} bản ghi
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <p className="font-medium text-slate-800">{actor.name}</p>
                              <p className="text-slate-500">{getActorRoleLabel(actor.role)}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-slate-800">{entrySummary(entry)}</p>
                              <button
                                type="button"
                                onClick={() => setExpandedKey(expanded ? null : entry.key)}
                                className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                                aria-expanded={expanded}
                              >
                                Chi tiết
                                {expanded ? (
                                  <ChevronUp size={14} aria-hidden="true" />
                                ) : (
                                  <ChevronDown size={14} aria-hidden="true" />
                                )}
                              </button>
                              {expanded && (
                                <div className="mt-2">
                                  {entry.kind === 'group' ? (
                                    <GroupDetail entry={entry} />
                                  ) : (
                                    <SingleDetail item={entry.item} />
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="space-y-3 md:hidden">
                  {entries.map((entry) => {
                    const meta = getActionMeta(entry.kind === 'group' ? entry.action : entry.item.action)
                    const actor = entryActor(entry)
                    const expanded = expandedKey === entry.key
                    return (
                      <li key={entry.key} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs text-slate-500">{formatVnDateTime(actor.time)}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-800">{entrySummary(entry)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {actor.name} · {getActorRoleLabel(actor.role)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setExpandedKey(expanded ? null : entry.key)}
                          className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                          aria-expanded={expanded}
                        >
                          Chi tiết
                          {expanded ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )}
                        </button>
                        {expanded && (
                          <div className="mt-2">
                            {entry.kind === 'group' ? <GroupDetail entry={entry} /> : <SingleDetail item={entry.item} />}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {results.items.length < results.total && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {loadingMore ? 'Đang tải thêm...' : `Xem thêm (${results.total - results.items.length} bản ghi)`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
