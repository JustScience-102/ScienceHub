import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Layers } from 'lucide-react'
import Notice from '../Notice'
import { supabase } from '../../lib/supabaseClient'
import { toVietnameseError } from '../../lib/errors'
import { classTitle } from '../../lib/dashboard'
import { groupClassMap, groupIsBalanced } from '../../lib/classGroups'

const MAX_SHOWN = 8

function GroupStatus({ group }) {
  const classes = groupClassMap(group)
  const nameOf = (id) => (classes.get(id) ? classTitle(classes.get(id)) : 'lớp khác')
  const balanced = groupIsBalanced(group)

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-slate-800">
        <Layers size={16} className="text-sky-600" aria-hidden="true" />
        Nhóm lớp: {group.name}
      </p>
      <ul className="space-y-0.5 text-slate-600">
        {group.parts.map((part) => (
          <li key={part.part_no}>
            <span className="font-medium text-slate-700">Phần {part.part_no}</span>
            {' · '}
            {part.classes
              .map((cls) => `${classTitle(cls)}${cls.hidden ? ' (đã ẩn)' : ''}: ${cls.student_count}`)
              .join(', ')}
            {' · '}
            <span className="font-semibold text-slate-800">tổng {part.student_count} em</span>
          </li>
        ))}
      </ul>

      {group.overlaps.length > 0 && (
        <Notice type="error">
          {group.overlaps.length} em đang học hai lớp cùng nội dung:{' '}
          {group.overlaps
            .slice(0, MAX_SHOWN)
            .map((row) => `${row.full_name} (${row.class_ids.map(nameOf).join(' và ')})`)
            .join('; ')}
          {group.overlaps.length > MAX_SHOWN ? ` và ${group.overlaps.length - MAX_SHOWN} em khác` : ''}. Hãy cho em nghỉ
          một lớp hoặc đổi lớp.
        </Notice>
      )}

      {group.incomplete.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900" role="status">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{group.incomplete.length} em chưa học đủ các phần:</p>
            <ul className="mt-1 space-y-0.5">
              {group.incomplete.slice(0, MAX_SHOWN).map((row) => (
                <li key={row.student_id}>
                  {row.full_name} ({row.student_code}) đang học {row.class_ids.map(nameOf).join(', ')}, thiếu{' '}
                  {row.missing_parts.map((no) => `Phần ${no}`).join(', ')}
                </li>
              ))}
            </ul>
            {group.incomplete.length > MAX_SHOWN && (
              <p className="mt-1">… và {group.incomplete.length - MAX_SHOWN} em khác.</p>
            )}
          </div>
        </div>
      )}

      {balanced && group.parts.length > 1 && (
        <p className="flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 size={16} aria-hidden="true" />
          Cân bằng: mọi em đều học đủ {group.parts.length} phần.
        </p>
      )}
    </div>
  )
}

// Tình trạng các nhóm lớp ở đầu trang Lớp học. Không có nhóm nào (mà người dùng được xem) thì không hiện gì.
// refreshKey đổi khi danh sách lớp hoặc nhóm thay đổi.
export default function ClassGroupsPanel({ refreshKey }) {
  const [state, setState] = useState({ groups: [], error: '' })

  useEffect(() => {
    let cancelled = false
    supabase.rpc('class_groups_overview').then(({ data, error }) => {
      if (cancelled) return
      setState({ groups: error ? [] : (data ?? []), error: error ? toVietnameseError(error) : '' })
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (state.error) return <Notice type="error">{state.error}</Notice>
  if (state.groups.length === 0) return null

  return (
    <section aria-label="Nhóm lớp" className="space-y-2 rounded-xl bg-slate-50 p-3">
      {state.groups.map((group) => (
        <GroupStatus key={group.id} group={group} />
      ))}
    </section>
  )
}
