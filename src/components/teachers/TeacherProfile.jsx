import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
import PageShell from '../PageShell'
import EmptyState from '../EmptyState'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency } from '../../lib/format'
import { formatSchedule } from '../../lib/schedule'
import { classGrade } from '../../lib/grade'
import { classTitle } from '../../lib/dashboard'
import TeacherAccountPanel from './TeacherAccountPanel'

// Hồ sơ giáo viên: thông tin liên hệ, tài khoản đăng nhập, các lớp đang phụ trách, số học sinh mỗi lớp
// và tổng số học sinh (đếm học sinh không trùng, không đếm lượt ghi danh).
export default function TeacherProfile({ teacherId, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [teacherResult, classResult, profileResult] = await Promise.all([
        supabase.from('teachers').select('*').eq('id', teacherId).maybeSingle(),
        supabase
          .from('classes')
          .select(
            'id, name, subject, grade, price_per_session, class_schedules(day_of_week, start_time, end_time), class_enrollments(student_id, status)',
          )
          .eq('teacher_id', teacherId)
          .is('deleted_at', null),
        supabase
          .from('profiles')
          .select('user_id, role, teacher_id, active')
          .eq('teacher_id', teacherId)
          .eq('role', 'teacher')
          .maybeSingle(),
      ])
      if (cancelled) return
      const failure = teacherResult.error || classResult.error || profileResult.error
      if (failure) {
        setError(toVietnameseError(failure))
      } else if (!teacherResult.data) {
        setError('Trung tâm không tìm thấy giáo viên này.')
      } else {
        setData({
          teacher: teacherResult.data,
          classes: classResult.data,
          profile: profileResult.data ?? null,
        })
        setError('')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [teacherId, reloadKey])

  const summary = useMemo(() => {
    if (!data) return { rows: [], distinct: 0, sum: 0 }
    const distinct = new Set()
    const rows = data.classes
      .map((cls) => {
        const students = new Set(
          (cls.class_enrollments ?? []).filter((row) => row.status === 'active').map((row) => row.student_id),
        )
        for (const id of students) distinct.add(id)
        return { cls, count: students.size }
      })
      .sort((a, b) => String(a.cls.name).localeCompare(String(b.cls.name), 'vi'))
    return { rows, distinct: distinct.size, sum: rows.reduce((total, row) => total + row.count, 0) }
  }, [data])

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
    >
      <ArrowLeft size={18} aria-hidden="true" />
      Quay lại danh sách giáo viên
    </button>
  )

  if (error) {
    return (
      <PageShell title="Hồ sơ giáo viên">
        {back}
        <Notice type="error">{error}</Notice>
      </PageShell>
    )
  }
  if (!data) {
    return (
      <PageShell title="Hồ sơ giáo viên">
        {back}
        <p className="text-sm text-slate-500">Trung tâm đang tải hồ sơ giáo viên...</p>
      </PageShell>
    )
  }

  const { teacher } = data

  return (
    <PageShell title={`Hồ sơ: ${teacher.full_name}`} description="Thông tin liên hệ và các lớp đang phụ trách.">
      {back}

      <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Họ tên</dt>
          <dd className="font-medium text-slate-800">
            {teacher.full_name}
            {teacher.deleted_at && (
              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                Đã ẩn
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Số điện thoại</dt>
          <dd className="font-medium text-slate-800">{teacher.phone || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="break-all font-medium text-slate-800">{teacher.email || '—'}</dd>
        </div>
      </dl>

      {notice && (
        <Notice type="success" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      )}

      <TeacherAccountPanel
        teacher={teacher}
        profile={data.profile}
        onChanged={(message) => {
          setNotice(message)
          setReloadKey((key) => key + 1)
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-sky-50 p-4">
          <p className="text-sm text-sky-700">Số lớp đang dạy</p>
          <p className="text-2xl font-bold text-sky-900">{summary.rows.length}</p>
        </div>
        <div className="rounded-xl bg-sky-50 p-4">
          <p className="text-sm text-sky-700">Tổng số học sinh của tất cả các lớp</p>
          <p className="text-2xl font-bold text-sky-900">{summary.distinct}</p>
          {summary.sum !== summary.distinct && (
            <p className="mt-1 text-xs text-sky-700">
              Mỗi học sinh chỉ đếm một lần, dù học nhiều lớp của giáo viên này (cộng số học sinh từng lớp là{' '}
              {summary.sum}).
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="teacher-classes-title" className="space-y-3">
        <h2 id="teacher-classes-title" className="text-lg font-semibold text-slate-800">
          Lớp đang dạy ({summary.rows.length})
        </h2>
        {summary.rows.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Giáo viên chưa phụ trách lớp nào"
            text="Gắn giáo viên vào lớp ở trang Quản lý Lớp học."
          />
        ) : (
          <>
            {/* Máy tính: dạng bảng */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Lớp</th>
                    <th className="px-3 py-3 font-semibold">Môn</th>
                    <th className="px-3 py-3 font-semibold">Khối</th>
                    <th className="px-3 py-3 font-semibold">Lịch học</th>
                    <th className="px-3 py-3 font-semibold">Đơn giá hiện tại</th>
                    <th className="px-3 py-3 text-center font-semibold">Số học sinh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.rows.map(({ cls, count }) => (
                    <tr key={cls.id}>
                      <td className="px-3 py-3 font-medium text-slate-800">{classTitle(cls)}</td>
                      <td className="px-3 py-3">{cls.subject || '—'}</td>
                      <td className="px-3 py-3">{classGrade(cls) ? `Khối ${classGrade(cls)}` : '—'}</td>
                      <td className="px-3 py-3">{formatSchedule(cls.class_schedules)}</td>
                      <td className="px-3 py-3">{formatCurrency(cls.price_per_session)}/buổi</td>
                      <td className="px-3 py-3 text-center font-medium">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại: dạng thẻ */}
            <ul className="space-y-3 md:hidden">
              {summary.rows.map(({ cls, count }) => (
                <li key={cls.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-800">{classTitle(cls)}</p>
                  <p className="text-sm text-slate-500">
                    {cls.subject || 'Chưa có môn'} · {classGrade(cls) ? `Khối ${classGrade(cls)}` : 'Chưa có khối'}
                  </p>
                  <dl className="mt-2 space-y-1 text-sm text-slate-600">
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-slate-500">Lịch học</dt>
                      <dd>{formatSchedule(cls.class_schedules)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-slate-500">Đơn giá</dt>
                      <dd>{formatCurrency(cls.price_per_session)}/buổi</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-slate-500">Số học sinh</dt>
                      <dd className="font-medium">{count}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </PageShell>
  )
}
