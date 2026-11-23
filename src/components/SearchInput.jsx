import { Search } from 'lucide-react'
import { canAutoFocus } from '../lib/pointer'

// Ô tìm kiếm có biểu tượng kính lúp. Cỡ chữ 16px trên điện thoại để iOS Safari không tự phóng to.
//   label: tên đọc cho trình đọc màn hình khi ô không có <label> riêng (có id + <label htmlFor> thì bỏ trống).
export default function SearchInput({ id, value, onChange, placeholder, label, autoFocus = false, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus && canAutoFocus()}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 sm:text-sm"
      />
    </div>
  )
}
