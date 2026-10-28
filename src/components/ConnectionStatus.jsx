import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

// Dòng kiểm tra kết nối Database (chỉ đọc): "đọc được N bản ghi" từ một bảng.
// V2: chỉ kiểm tra khi ĐÃ đăng nhập. Chưa đăng nhập (hoặc bảng đã khóa RLS với anon) thì không báo lỗi giả.
export default function ConnectionStatus({ table, label }) {
  const [state, setState] = useState(
    isSupabaseConfigured ? { phase: 'loading' } : { phase: 'unconfigured' },
  )

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session) {
        setState({ phase: 'signed_out' })
        return
      }
      supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .then(({ count, error }) => {
          if (cancelled) return
          if (error) setState({ phase: 'error', message: error.message })
          else setState({ phase: 'ok', count })
        })
    })

    return () => {
      cancelled = true
    }
  }, [table])

  if (state.phase === 'signed_out') return null

  if (state.phase === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Trung tâm đang kết nối dữ liệu...
      </p>
    )
  }

  if (state.phase === 'unconfigured') {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Trung tâm chưa kết nối Supabase. Hãy điền khóa vào file .env rồi chạy lại ứng dụng.
      </p>
    )
  }

  if (state.phase === 'error') {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Không đọc được dữ liệu: {state.message}
      </p>
    )
  }

  return (
    <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
      Kết nối dữ liệu: đọc được {state.count} {label}
    </p>
  )
}
