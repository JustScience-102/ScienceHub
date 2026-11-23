// Kiểu nút dùng chung (cao tối thiểu 44px). Dùng: <button className={BTN_PRIMARY}>.
// Hàng nút "Hủy / Lưu" cuối hộp thoại thì dùng components/FormActions.jsx.
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium disabled:opacity-50'

export const BTN_PRIMARY = `${BASE} bg-sky-500 text-white hover:bg-sky-600`

export const BTN_SECONDARY = `${BASE} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`

export const BTN_DANGER = `${BASE} bg-red-500 text-white hover:bg-red-600`
