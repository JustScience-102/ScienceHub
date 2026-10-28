// Khung chung của mỗi trang: tiêu đề, mô tả ngắn và vùng nội dung dạng thẻ trắng.
export default function PageShell({ title, description, children }) {
  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        {children}
      </div>
    </section>
  )
}
