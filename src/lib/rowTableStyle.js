// Kiểu bảng "mỗi dòng là một khung bo góc", dùng chung cho Lịch học (Dashboard) và Quản lý lớp học.
// Dùng: <table className={ROW_TABLE}>, <tr className={ROW}>, <td className={`${CELL} px-3 py-3`}>.
export const ROW_TABLE = 'w-full border-separate border-spacing-y-2 text-left text-sm'

export const ROW = 'group'

export const CELL =
  'border-y border-slate-200 bg-white first:rounded-l-xl first:border-l last:rounded-r-xl last:border-r'

// Dòng bấm được: sáng viền xanh khi rê chuột.
export const CELL_CLICKABLE = 'group-hover:border-sky-300 group-hover:bg-sky-50 transition-colors'

// Dòng đã ẩn (lớp bị ẩn).
export const CELL_MUTED = '!bg-slate-50 text-slate-400'
