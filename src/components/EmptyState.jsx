// Hiển thị khi danh sách trống.
export default function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
      {Icon && <Icon size={32} className="mb-3 text-slate-300" aria-hidden="true" />}
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500">{text}</p>}
    </div>
  )
}
