import { useEffect, useMemo, useState } from 'react'
import { Plus, BookOpen, Users, Pencil, Trash2, RotateCcw, ClipboardCheck, Search } from 'lucide-react'
import PageShell from '../components/PageShell'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import Notice from '../components/Notice'
import ClassForm from '../components/classes/ClassForm'
import ClassRoster from '../components/classes/ClassRoster'
import ChangeTeacherDialog from '../components/classes/ChangeTeacherDialog'
import TeacherStatsBar from '../components/classes/TeacherStatsBar'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { toVietnameseError } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import { fetchAll } from '../lib/fetchAll'
import { formatSchedule, groupSchedulesByClass, hasSessionOn, todayISO, weekdayLabel } from '../lib/schedule'
import { classTitle, subjectColor } from '../lib/dashboard'
import { CELL, CELL_CLICKABLE, CELL_MUTED, ROW, ROW_TABLE } from '../lib/rowTableStyle'
import { compareVietnameseNames, normalizeText } from '../lib/text'
import { NONE, buildOptions, classGrade } from '../lib/grade'
import SelectField from '../components/SelectField'
import MobileFilters from '../components/MobileFilters'

const BTN =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors'

// Cụm nút trên mỗi dòng lớp: Học sinh, Điểm danh, Sửa, Xóa (ẩn) hoặc Khôi phục.
function ClassActions({ cls, onOpen, onAttendance, onEdit, onDelete, onRestore }) {
  if (cls.deleted_at) {
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Khôi phục lớp ${cls.name}`}
        className={`${BTN} bg-sky-50 text-sky-700 hover:bg-sky-100`}
      >
        <RotateCcw size={16} aria-hidden="true" />
        Khôi phục
      </button>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Xem học sinh lớp ${cls.name}`}
        className={`${BTN} bg-sky-50 text-sky-700 hover:bg-sky-100`}
      >
        <Users size={16} aria-hidden="true" />
        Học sinh
      </button>
      <button
        type="button"
        onClick={onAttendance}
        aria-label={`Điểm danh lớp ${cls.name}`}
        className={`${BTN} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
      >
        <ClipboardCheck size={16} aria-hidden="true" />
        Điểm danh
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Sửa lớp ${cls.name}`}
        className={`${BTN} bg-slate-100 text-slate-700 hover:bg-slate-200`}
      >
        <Pencil size={16} aria-hidden="true" />
        Sửa
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Xóa lớp ${cls.name}`}
        className={`${BTN} bg-red-50 text-red-600 hover:bg-red-100`}
      >
        <Trash2 size={16} aria-hidden="true" />
        Xóa
      </button>
    </div>
  )
}

// initialClassId / initialDate (tùy chọn): mở thẳng màn hình điểm danh của một lớp,
// dành cho lối tắt từ Dashboard.
// isTeacher / teacherId: Giáo viên chỉ thấy lớp của mình (RLS), không đổi được giáo viên phụ trách.
export default function ClassesPage({
  initialClassId = null,
  initialDate,
  isTeacher = false,
  teacherId = null,
} = {}) {
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [schedules, setSchedules] = useState({})
  const [activeCounts, setActiveCounts] = useState({})
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { mode: 'create' | 'edit', cls? }
  const [restoring, setRestoring] = useState(null) // lớp đang chờ chọn giáo viên để khôi phục
  const [deleting, setDeleting] = useState(null)
  const [openedId, setOpenedId] = useState(initialClassId)
  const [openedTab, setOpenedTab] = useState(initialClassId ? 'attendance' : 'students')
  const [openedDate, setOpenedDate] = useState(initialDate)
  const [filterDate, setFilterDate] = useState(todayISO)
  const [filterByDate, setFilterByDate] = useState(true)
  const [gradeFilter, setGradeFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false

    async function load() {
      const [classResult, teacherResult, enrollResult, scheduleResult] = await Promise.all([
        fetchAll(() => supabase.from('classes').select('*')),
        fetchAll(() => supabase.from('teachers').select('id, full_name, deleted_at')),
        fetchAll(() => supabase.from('class_enrollments').select('id, class_id').eq('status', 'active')),
        fetchAll(() => supabase.from('class_schedules').select('*')),
      ])
      if (cancelled) return

      const error =
        classResult.error || teacherResult.error || enrollResult.error || scheduleResult.error
      if (error) {
        setLoadError(toVietnameseError(error))
      } else {
        const counts = {}
        for (const row of enrollResult.data) {
          counts[row.class_id] = (counts[row.class_id] ?? 0) + 1
        }
        setClasses(classResult.data)
        setTeachers(teacherResult.data)
        setActiveCounts(counts)
        setSchedules(groupSchedulesByClass(scheduleResult.data))
        setLoadError('')
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => setReloadKey((key) => key + 1)

  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers])
  const visibleTeachers = useMemo(() => teachers.filter((teacher) => !teacher.deleted_at), [teachers])
  const teacherName = (cls) => teacherById.get(cls.teacher_id)?.full_name ?? ''

  // Bộ lọc theo ngày: chỉ giữ lớp có buổi học vào ngày được chọn (lịch hiệu lực của chính ngày đó).
  const hasClassOnFilterDay = (cls) => Boolean(filterDate) && hasSessionOn(schedules[cls.id] ?? [], filterDate)
  const dateFilterActive = filterByDate && Boolean(filterDate)

  const visibleClasses = useMemo(() => {
    const keyword = normalizeText(query)
    return classes
      .filter((cls) => showHidden || !cls.deleted_at)
      .filter((cls) => !dateFilterActive || hasSessionOn(schedules[cls.id] ?? [], filterDate))
      .filter((cls) => {
        if (!gradeFilter) return true
        const grade = classGrade(cls)
        return gradeFilter === NONE ? !grade : String(grade) === gradeFilter
      })
      .filter((cls) => {
        if (!subjectFilter) return true
        return subjectFilter === NONE ? !cls.subject : cls.subject === subjectFilter
      })
      .filter((cls) => {
        if (!keyword) return true
        const tName = teacherById.get(cls.teacher_id)?.full_name ?? ''
        const haystack = normalizeText([cls.name, cls.subject, tName].join(' '))
        return haystack.includes(keyword)
      })
      .sort((a, b) => compareVietnameseNames(a.name, b.name))
  }, [
    classes,
    showHidden,
    dateFilterActive,
    filterDate,
    schedules,
    gradeFilter,
    subjectFilter,
    query,
    teacherById,
  ])

  const hiddenCount = classes.filter((cls) => cls.deleted_at).length

  // Lựa chọn của hai ô lọc lấy từ các lớp đang hiển thị (lớp chưa có khối/môn vào mục Chưa phân loại).
  const gradeOptions = useMemo(
    () => buildOptions(classes.filter((cls) => showHidden || !cls.deleted_at).map(classGrade), { numeric: true }),
    [classes, showHidden],
  )
  const subjectOptions = useMemo(
    () => buildOptions(classes.filter((cls) => showHidden || !cls.deleted_at).map((cls) => cls.subject)),
    [classes, showHidden],
  )

  // Mở lớp ở tab Điểm danh; ngày điểm danh lấy từ bộ lọc nếu lớp có lịch hôm đó và không ở tương lai.
  function openAttendance(cls) {
    const usable = filterDate && filterDate <= todayISO() && hasClassOnFilterDay(cls)
    setOpenedDate(usable ? filterDate : undefined)
    setOpenedTab('attendance')
    setOpenedId(cls.id)
  }

  function openStudents(cls) {
    setOpenedTab('students')
    setOpenedDate(undefined)
    setOpenedId(cls.id)
  }

  // Tên lớp là nút bấm mở chi tiết lớp.
  function nameButton(cls) {
    return (
      <button
        type="button"
        onClick={() => openStudents(cls)}
        aria-label={`Xem chi tiết lớp ${cls.name}`}
        className={`break-all rounded-lg px-2.5 py-1 text-left font-semibold hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-sky-300 ${
          cls.deleted_at ? 'bg-slate-200 text-slate-500' : subjectColor(cls.subject)
        }`}
      >
        {classTitle({ ...cls, grade: classGrade(cls) })}
      </button>
    )
  }

  // Lưu lớp + lịch học trong một lần gọi; tên lớp do Database đặt. Trả về câu báo lỗi (nếu có) để form hiển thị.
  async function handleSave(values) {
    const { data, error } = await supabase.rpc('save_class', {
      p_class_id: editing.cls?.id ?? null,
      p_subject: values.subject,
      p_grade: values.grade,
      p_class_no: values.classNo,
      p_teacher_id: values.teacherId,
      p_price: values.price,
      p_schedule: values.schedule,
      p_schedule_from: values.scheduleFrom || null,
    })
    if (error) return toVietnameseError(error)

    const mismatch = Number(data?.mismatched_sessions) || 0
    setNotice({
      type: mismatch > 0 ? 'info' : 'success',
      text:
        `Trung tâm đã ${editing.mode === 'create' ? 'thêm' : 'cập nhật'} lớp ${data?.name ?? ''}.` +
        (mismatch > 0
          ? ` Lưu ý: có ${mismatch} buổi đã điểm danh từ ngày áp dụng lịch mới không khớp lịch mới (dữ liệu cũ vẫn được giữ).`
          : ''),
    })
    setEditing(null)
    reload()
    return ''
  }

  function requestDelete(cls) {
    const count = activeCounts[cls.id] ?? 0
    if (count > 0) {
      setNotice({
        type: 'error',
        text: `Không thể xóa lớp ${cls.name}: lớp còn ${count} học sinh đang học. Hãy cho các học sinh nghỉ khỏi lớp trước.`,
      })
      return
    }
    setNotice(null)
    setDeleting(cls)
  }

  async function confirmDelete() {
    setBusy(true)
    // Mọi thao tác ghi đều qua RPC (Quản lý cũng không ghi thẳng bảng).
    const { error } = await supabase.rpc('set_class_hidden', { p_class_id: deleting.id, p_hidden: true })
    setBusy(false)

    if (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } else {
      setNotice({
        type: 'success',
        text: `Trung tâm đã xóa lớp ${deleting.name} khỏi danh sách. Lịch sử điểm danh và doanh thu vẫn được giữ và có thể khôi phục.`,
      })
      reload()
    }
    setDeleting(null)
  }

  // Khôi phục lớp:
  //  - Quản lý, giáo viên cũ đang ẩn (hoặc không còn): mở hộp thoại chọn giáo viên khác
  //  - còn lại: khôi phục ngay. Database giữ STT nếu còn trống, không thì lấy STT kế tiếp và đặt lại tên.
  async function handleRestore(cls) {
    setNotice(null)
    const teacher = teacherById.get(cls.teacher_id)
    if (!isTeacher && (!teacher || teacher.deleted_at)) {
      setRestoring(cls)
      return
    }
    const message = await restoreClass(cls, null)
    if (message) setNotice({ type: 'error', text: message })
  }

  // Khôi phục lớp (đổi giáo viên nếu có chọn). Trả về câu báo lỗi hoặc ''.
  async function restoreClass(cls, newTeacherId) {
    const { data, error } = await supabase.rpc('set_class_hidden', {
      p_class_id: cls.id,
      p_hidden: false,
      p_teacher_id: newTeacherId,
    })
    if (error) return toVietnameseError(error)

    setNotice({
      type: 'success',
      text:
        data?.name && data.name !== cls.name
          ? `Trung tâm đã khôi phục lớp, tên lớp mới là ${data.name}.`
          : `Trung tâm đã khôi phục lớp ${cls.name}.`,
    })
    setRestoring(null)
    reload()
    return ''
  }

  const openedClass = openedId ? classes.find((cls) => cls.id === openedId) : null
  if (openedId && loading) {
    return (
      <PageShell title="Quản lý Lớp học">
        <p className="text-sm text-slate-500">Trung tâm đang mở lớp học...</p>
      </PageShell>
    )
  }
  if (openedClass) {
    return (
      <ClassRoster
        cls={openedClass}
        schedule={formatSchedule(schedules[openedClass.id])}
        teacherName={teacherName(openedClass)}
        initialTab={openedTab}
        initialDate={openedDate}
        isTeacher={isTeacher}
        onBack={() => {
          setOpenedId(null)
          reload()
        }}
      />
    )
  }

  // Số bộ lọc đang khác mặc định (hiện trên nút "Bộ lọc" ở điện thoại).
  const activeFilterCount =
    (filterDate !== todayISO() ? 1 : 0) +
    (filterByDate ? 0 : 1) +
    (gradeFilter ? 1 : 0) +
    (subjectFilter ? 1 : 0) +
    (showHidden ? 1 : 0)

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên lớp, môn học hoặc giáo viên"
            aria-label="Tìm kiếm lớp học"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'create' })}
          className="hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 md:inline-flex"
        >
          <Plus size={18} aria-hidden="true" />
          Thêm lớp
        </button>
      </div>

      <MobileFilters
        id="class-filters"
        activeCount={activeFilterCount}
        actions={
          <button
            type="button"
            onClick={() => setEditing({ mode: 'create' })}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600"
          >
            <Plus size={18} aria-hidden="true" />
            Thêm lớp
          </button>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex w-full items-center gap-2 text-sm font-medium text-slate-700 sm:w-auto">
                Ngày
                <input
                  type="date"
                  value={filterDate}
                  onChange={(event) => setFilterDate(event.target.value)}
                  aria-label="Lọc lớp học theo ngày"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:flex-none sm:text-sm"
                />
              </label>
              {filterDate !== todayISO() && (
                <button
                  type="button"
                  onClick={() => setFilterDate(todayISO())}
                  className={`${BTN} bg-white text-sky-700 ring-1 ring-slate-200 hover:bg-sky-50`}
                >
                  Hôm nay
                </button>
              )}
              {filterDate && (
                <span className="text-sm text-slate-500">{weekdayLabel(filterDate)}</span>
              )}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!filterByDate}
                onChange={(event) => setFilterByDate(!event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Hiện tất cả lớp
            </label>
          </div>
    
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              id="class-grade-filter"
              label="Lọc theo khối"
              value={gradeFilter}
              onChange={setGradeFilter}
              placeholder="Tất cả khối"
            >
              {gradeOptions.list.map((grade) => (
                <option key={grade} value={String(grade)}>
                  Khối {grade}
                </option>
              ))}
              {gradeOptions.hasNone && <option value={NONE}>Chưa phân loại</option>}
            </SelectField>
            <SelectField
              id="class-subject-filter"
              label="Lọc theo môn"
              value={subjectFilter}
              onChange={setSubjectFilter}
              placeholder="Tất cả môn"
            >
              {subjectOptions.list.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
              {subjectOptions.hasNone && <option value={NONE}>Chưa phân loại</option>}
            </SelectField>
          </div>
    
          <div className="flex items-center justify-between">
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Hiện cả lớp đã ẩn{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
            </label>
          </div>
        </div>
      </MobileFilters>
    </div>
  )

  let body
  if (!isSupabaseConfigured) {
    body = (
      <Notice type="error">
        Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
      </Notice>
    )
  } else if (loading && classes.length === 0) {
    body = <p className="text-sm text-slate-500">Trung tâm đang tải danh sách lớp...</p>
  } else if (loadError) {
    body = <Notice type="error">{loadError}</Notice>
  } else if (visibleClasses.length === 0) {
    body = dateFilterActive || gradeFilter || subjectFilter || query ? (
      <EmptyState
        icon={BookOpen}
        title="Không có lớp nào phù hợp với bộ lọc"
        text='Hãy đổi từ khóa, ngày, khối hoặc môn, hoặc bật "Hiện tất cả lớp" để xem toàn bộ lớp.'
      />
    ) : (
      <EmptyState
        icon={BookOpen}
        title="Trung tâm chưa có lớp học nào"
        text='Bấm "Thêm lớp" để bắt đầu.'
      />
    )
  } else {
    const hiddenBadge = (
      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
        Đã ẩn
      </span>
    )
    body = (
      <>
        {/* Máy tính: dạng bảng */}
        <div className="hidden overflow-x-auto md:block">
          <table className={ROW_TABLE}>
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Tên lớp</th>
                <th className="px-3 py-3 font-semibold">Giáo viên</th>
                <th className="px-3 py-3 font-semibold">Lịch học</th>
                <th className="px-3 py-3 text-right font-semibold">Đơn giá/buổi</th>
                <th className="px-3 py-3 text-center font-semibold">Sĩ số</th>
                <th className="px-3 py-3 font-semibold">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleClasses.map((cls) => {
                const cell = `${CELL} px-3 py-3 ${cls.deleted_at ? CELL_MUTED : CELL_CLICKABLE}`
                return (
                <tr key={cls.id} className={ROW}>
                  <td className={`${cell} font-medium`}>
                    {nameButton(cls)}
                    {cls.deleted_at && hiddenBadge}
                  </td>
                  <td className={`${cell} font-semibold ${cls.deleted_at ? '' : 'text-slate-800'}`}>
                    {teacherName(cls) || 'Chưa gắn giáo viên'}
                  </td>
                  <td className={cell}>{formatSchedule(schedules[cls.id])}</td>
                  <td className={`${cell} text-right`}>{formatCurrency(cls.price_per_session)}</td>
                  <td className={`${cell} text-center`}>{activeCounts[cls.id] ?? 0}</td>
                  <td className={cell}>
                    <div className="flex justify-end">
                      <ClassActions
                        cls={cls}
                        onOpen={() => openStudents(cls)}
                        onAttendance={() => openAttendance(cls)}
                        onEdit={() => setEditing({ mode: 'edit', cls })}
                        onDelete={() => requestDelete(cls)}
                        onRestore={() => handleRestore(cls)}
                      />
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Điện thoại: dạng thẻ */}
        <ul className="space-y-3 md:hidden">
          {visibleClasses.map((cls) => (
            <li
              key={cls.id}
              className={`rounded-xl border border-slate-200 p-4 ${cls.deleted_at ? 'bg-slate-50 text-slate-400' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                {nameButton(cls)}
                {cls.deleted_at ? (
                  <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                    Đã ẩn
                  </span>
                ) : (
                  // Nút phụ (Sửa/Xóa) chỉ còn biểu tượng ở góc thẻ để nút chính không bị rớt hàng.
                  <div className="-mr-1 -mt-1 flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing({ mode: 'edit', cls })}
                      aria-label={`Sửa lớp ${cls.name}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(cls)}
                      aria-label={`Xóa lớp ${cls.name}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Giáo viên</dt>
                  <dd className="font-medium text-slate-700">{teacherName(cls) || 'Chưa gắn giáo viên'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Đơn giá</dt>
                  <dd className="font-medium text-slate-700">{formatCurrency(cls.price_per_session)}/buổi</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Lịch học</dt>
                  <dd className="font-medium text-slate-700">{formatSchedule(schedules[cls.id])}</dd>
                </div>
              </dl>
              {cls.deleted_at ? (
                <div className="mt-3">
                  <ClassActions
                    cls={cls}
                    onOpen={() => openStudents(cls)}
                    onAttendance={() => openAttendance(cls)}
                    onEdit={() => setEditing({ mode: 'edit', cls })}
                    onDelete={() => requestDelete(cls)}
                    onRestore={() => handleRestore(cls)}
                  />
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openAttendance(cls)}
                    aria-label={`Điểm danh lớp ${cls.name}`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    <ClipboardCheck size={16} aria-hidden="true" />
                    Điểm danh
                  </button>
                  <button
                    type="button"
                    onClick={() => openStudents(cls)}
                    aria-label={`Xem học sinh lớp ${cls.name}`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-700 hover:bg-sky-100"
                  >
                    <Users size={16} aria-hidden="true" />
                    Học sinh · {activeCounts[cls.id] ?? 0}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <PageShell title="Quản lý Lớp học" description="Danh sách lớp học và ghi danh học sinh của Trung tâm.">
      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {isSupabaseConfigured && isTeacher && <TeacherStatsBar refreshKey={reloadKey} />}
      {isSupabaseConfigured && toolbar}
      {body}

      {editing && (
        <ClassForm
          mode={editing.mode}
          cls={editing.cls}
          scheduleRows={editing.cls ? schedules[editing.cls.id] : []}
          teachers={visibleTeachers}
          lockedTeacherId={isTeacher ? teacherId : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {restoring && (
        <ChangeTeacherDialog
          cls={restoring}
          oldTeacherName={teacherName(restoring)}
          teachers={visibleTeachers}
          onConfirm={(chosenTeacherId) => restoreClass(restoring, chosenTeacherId)}
          onClose={() => setRestoring(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Xóa lớp"
          message={`Trung tâm sẽ xóa lớp ${deleting.name} khỏi danh sách. Lịch sử điểm danh và doanh thu vẫn được giữ, bạn có thể khôi phục bất cứ lúc nào bằng cách bật "Hiện cả lớp đã ẩn".`}
          confirmLabel="Xóa lớp"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageShell>
  )
}