import { Pencil, Trash2, RotateCcw } from 'lucide-react'

// Cụm nút thao tác trên mỗi dòng: Sửa + Xóa, hoặc Khôi phục nếu mục đã bị ẩn.
// canDelete = false: ẩn nút Xóa (Giáo viên không được ẩn học sinh trực tiếp).
export default function RowActions({ name, hidden, onEdit, onDelete, onRestore, canDelete = true }) {
  const base =
    'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors'

  if (hidden) {
    // Mục đã ẩn mà trang không cung cấp onRestore (ví dụ Học sinh: tự hiện lại khi được thêm vào lớp)
    // thì không hiện nút Khôi phục.
    if (!onRestore) return null
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Khôi phục ${name}`}
        className={`${base} bg-sky-50 text-sky-700 hover:bg-sky-100`}
      >
        <RotateCcw size={16} aria-hidden="true" />
        Khôi phục
      </button>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Sửa ${name}`}
        className={`${base} bg-slate-100 text-slate-700 hover:bg-slate-200`}
      >
        <Pencil size={16} aria-hidden="true" />
        Sửa
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Xóa ${name}`}
          className={`${base} bg-red-50 text-red-600 hover:bg-red-100`}
        >
          <Trash2 size={16} aria-hidden="true" />
          Xóa
        </button>
      )}
    </div>
  )
}
