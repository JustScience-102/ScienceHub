// Khóa sổ tháng (chỉ Quản lý): chốt tháng đã qua để số liệu điểm danh và học phí không thể bị sửa âm thầm.
// Mở lại phải ghi lý do; cả hai thao tác ghi vào Nhật ký thay đổi.
import { useEffect, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import Notice from '../Notice'
import FormField from '../FormField'
import SelectField from '../SelectField'
import { toVietnameseError } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { todayISO } from '../../lib/schedule'
import { monthLabel, monthOf, shiftMonth } from '../../lib/tuition'
import { closeMonth, listClosedMonths, monthFromStart, reopenMonth } from '../../lib/monthClose'

const SECONDARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50'

const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}-01`

export default function MonthCloseSection() {
  const current = monthOf(todayISO())
  // 12 tháng đã qua gần nhất để chọn chốt sổ
  const choices = Array.from({ length: 12 }, (_, index) => shiftMonth(current, -(index + 1)))
  const [closed, setClosed] = useState(null)
  const [selected, setSelected] = useState(monthKey(choices[0]))
  const [reopening, setReopening] = useState(null) // month_start đang mở lại
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listClosedMonths()
      .then((rows) => !cancelled && setClosed(rows))
      .catch((error) => {
        if (cancelled) return
        setClosed([])
        setNotice({ type: 'error', text: toVietnameseError(error) })
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const closedSet = new Set((closed ?? []).map((row) => row.month_start))
  const selectedClosed = closedSet.has(selected)

  async function run(key, task) {
    if (busy) return
    setBusy(key)
    setNotice(null)
    try {
      await task()
      setReloadKey((value) => value + 1)
    } catch (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } finally {
      setBusy('')
    }
  }

  function handleClose() {
    const target = monthFromStart(selected)
    return run('close', async () => {
      const result = await closeMonth(target)
      setNotice({
        type: 'success',
        text: `Trung tâm đã chốt sổ ${monthLabel(target).toLowerCase()}: ${result.charged_sessions} lượt tính tiền, tổng ${formatCurrency(result.revenue)}.`,
      })
    })
  }

  function handleReopen() {
    const target = monthFromStart(reopening)
    return run('reopen', async () => {
      await reopenMonth(target, reason.trim())
      setNotice({ type: 'success', text: `Trung tâm đã mở lại sổ ${monthLabel(target).toLowerCase()}.` })
      setReopening(null)
      setReason('')
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Lock size={16} className="text-sky-600" aria-hidden="true" />
          3. Khóa sổ tháng
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Sau khi thu học phí một tháng, hãy chốt sổ tháng đó: không ai (kể cả Quản lý) thêm, sửa, xóa được điểm danh và
          học bù của tháng đã chốt, nên tổng học phí không thể thay đổi âm thầm. Cần sửa thì mở lại sổ kèm lý do.
        </p>
      </div>

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <SelectField id="month-close-select" label="Tháng muốn chốt" value={selected} onChange={setSelected}>
            {choices.map((item) => (
              <option key={monthKey(item)} value={monthKey(item)}>
                {monthLabel(item)}
                {closedSet.has(monthKey(item)) ? ' (đã chốt)' : ''}
              </option>
            ))}
          </SelectField>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={Boolean(busy) || closed === null || selectedClosed}
          className={PRIMARY_BTN}
        >
          <Lock size={16} aria-hidden="true" />
          {busy === 'close' ? 'Đang chốt...' : selectedClosed ? 'Tháng này đã chốt' : 'Chốt sổ tháng này'}
        </button>
      </div>

      {closed && closed.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {closed.map((row) => (
            <li key={row.month_start} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <strong>{monthLabel(monthFromStart(row.month_start))}</strong>
                <span className="text-slate-500">
                  {' '}
                  · chốt {formatDate(row.closed_at)}
                  {row.closed_by_name ? ` bởi ${row.closed_by_name}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setReopening(row.month_start)
                  setReason('')
                }}
                disabled={Boolean(busy)}
                className={SECONDARY_BTN}
              >
                <LockOpen size={16} aria-hidden="true" />
                Mở lại sổ
              </button>
            </li>
          ))}
        </ul>
      )}

      {reopening && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-semibold text-amber-800">
            Mở lại sổ {monthLabel(monthFromStart(reopening)).toLowerCase()}: lý do sẽ được ghi vào Nhật ký thay đổi.
          </p>
          <FormField
            id="month-reopen-reason"
            label="Lý do mở lại sổ"
            required
            value={reason}
            onChange={setReason}
            placeholder="Ví dụ: Sửa điểm danh nhầm của em Minh Anh ngày 12/10"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setReopening(null)} disabled={Boolean(busy)} className={SECONDARY_BTN}>
              Hủy
            </button>
            <button
              type="button"
              onClick={handleReopen}
              disabled={Boolean(busy) || reason.trim().length < 5}
              className={PRIMARY_BTN}
            >
              {busy === 'reopen' ? 'Đang mở...' : 'Mở lại sổ'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
