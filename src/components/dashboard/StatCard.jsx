const TONES = {
  sky: { box: 'bg-sky-50', icon: 'bg-sky-100 text-sky-700', value: 'text-sky-900' },
  emerald: { box: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-900' },
  amber: { box: 'bg-amber-50', icon: 'bg-amber-100 text-amber-700', value: 'text-amber-900' },
  slate: { box: 'bg-slate-50', icon: 'bg-slate-200 text-slate-700', value: 'text-slate-900' },
}

// Một thẻ thống kê của Dashboard: biểu tượng, nhãn, con số lớn và ghi chú nhỏ.
export default function StatCard({ icon: Icon, label, value, hint, tone = 'sky', wide = false }) {
  const style = TONES[tone] ?? TONES.sky
  return (
    <div className={`rounded-xl p-4 ${style.box} ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <p className="text-sm text-slate-600">{label}</p>
      </div>
      <p className={`mt-3 text-2xl font-bold ${style.value}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
