import { canAutoFocus } from '../lib/pointer'

// Một ô nhập liệu kèm nhãn, gợi ý và thông báo lỗi.
// Cỡ chữ 16px trên điện thoại để iOS Safari không tự phóng to khi bấm vào ô.
export default function FormField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  type = 'text',
  inputMode,
  placeholder,
  autoFocus = false,
  maxLength,
  min,
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus && canAutoFocus()}
        maxLength={maxLength}
        min={min}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`min-h-11 w-full rounded-lg border px-3 text-base text-slate-800 sm:text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-500 ${
          error ? 'border-red-400 focus:border-red-400' : 'border-slate-300 focus:border-sky-400'
        }`}
      />
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
