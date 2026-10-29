// Ô chọn từ danh sách xổ xuống kèm nhãn và thông báo lỗi (FormField chỉ hỗ trợ ô nhập chữ).
export default function SelectField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  placeholder,
  children,
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`min-h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-800 sm:text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-500 ${
          error ? 'border-red-400 focus:border-red-400' : 'border-slate-300 focus:border-sky-400'
        }`}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
