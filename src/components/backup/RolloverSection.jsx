// Chuyển năm học (chỉ Quản lý): sao lưu -> xem trước -> gõ cụm xác nhận -> chuyển.
// Lớp cuối cấp (5, 9, 12) cho nghỉ hết học sinh rồi ẩn; các lớp còn lại lên 1 khối và đổi tên lớp.
// Điểm danh và học phí các tháng cũ giữ nguyên; tên lớp cũ vẫn hiện đúng ở lịch sử (class_versions).
import { useState } from 'react'
import { Download, GraduationCap, Search } from 'lucide-react'
import Notice from '../Notice'
import FormField from '../FormField'
import { toVietnameseError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { todayISO } from '../../lib/schedule'
import { downloadFullCenterBackupJson } from '../../lib/backup'
import { CLOSING_GRADES, ROLLOVER_CONFIRM_TEXT, previewRollover, runRollover } from '../../lib/rollover'

const SECONDARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50'

export default function RolloverSection() {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [backedUp, setBackedUp] = useState(false)
  const [preview, setPreview] = useState(null) // { date, result }
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)

  const dateValid = Boolean(date) && date <= today
  const previewOk = preview !== null && preview.date === date && preview.result.ok === true
  const canRun = backedUp && previewOk && confirmText.trim() === ROLLOVER_CONFIRM_TEXT

  async function run(key, task) {
    if (busy) return
    setBusy(key)
    setNotice(null)
    try {
      await task()
    } catch (error) {
      setNotice({ type: 'error', text: toVietnameseError(error) })
    } finally {
      setBusy('')
    }
  }

  function changeDate(value) {
    setDate(value)
    setPreview(null)
    setConfirmText('')
  }

  function handleBackup() {
    return run('backup', async () => {
      const result = await downloadFullCenterBackupJson({ includeAuditLog: true })
      setBackedUp(true)
      setNotice({ type: 'success', text: `Trung tâm đã tải bản sao lưu: ${result.filename}. Hãy mở kiểm tra, rồi làm Bước 2.` })
    })
  }

  function handlePreview() {
    return run('preview', async () => {
      const result = await previewRollover(date)
      setPreview({ date, result })
      setConfirmText('')
    })
  }

  function handleRun() {
    return run('run', async () => {
      const result = await runRollover(date, confirmText)
      setPreview(null)
      setConfirmText('')
      setNotice({
        type: 'success',
        text: `Trung tâm đã chuyển năm học từ ngày ${formatDate(date)}: ${result.promoted.length} lớp lên khối, ${result.closed.length} lớp cuối cấp được đóng, ${result.students_dropped} học sinh cho nghỉ.`,
      })
    })
  }

  const result = preview?.result

  return (
    <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="flex items-start gap-2">
        <GraduationCap size={18} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">4. Chuyển năm học</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Lớp cuối cấp (khối {CLOSING_GRADES.join(', ')}): cho nghỉ hết học sinh rồi ẩn lớp. Các lớp còn lại lên 1
            khối và đổi tên theo khối mới. Điểm danh, học phí và tên lớp cũ ở các tháng đã qua vẫn giữ nguyên. Học
            sinh lưu ban hoặc muốn học tiếp ở khối mới: cho nghỉ trước khi chuyển rồi ghi danh lại sau.
          </p>
        </div>
      </div>

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-800">Bước 1: Tải bản sao lưu toàn hệ thống trước khi chuyển</p>
        <button type="button" onClick={handleBackup} disabled={Boolean(busy)} className={PRIMARY_BTN}>
          <Download size={16} aria-hidden="true" />
          {busy === 'backup' ? 'Đang tạo file...' : 'Tải bản sao lưu (.json)'}
        </button>
        {backedUp && <p className="text-xs font-medium text-emerald-700">Đã tải bản sao lưu.</p>}
      </div>

      <div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-800">Bước 2: Chọn ngày chuyển và xem trước</p>
        <FormField
          id="rollover-date"
          label="Ngày chuyển năm học"
          type="date"
          value={date}
          onChange={changeDate}
          error={date && !dateValid ? 'Ngày chuyển không được ở tương lai.' : ''}
          hint="Chọn ngày sau buổi học cuối của năm học cũ. Ngày này thuộc năm học mới."
        />
        <button
          type="button"
          onClick={handlePreview}
          disabled={Boolean(busy) || !backedUp || !dateValid}
          className={SECONDARY_BTN}
        >
          <Search size={16} aria-hidden="true" />
          {busy === 'preview' ? 'Đang kiểm tra...' : 'Xem trước'}
        </button>
        {!backedUp && <p className="text-xs text-slate-500">Hãy tải bản sao lưu ở Bước 1 trước.</p>}

        {result && preview.date === date && (
          <div className="space-y-3 pt-1">
            {result.errors.length > 0 && (
              <Notice type="error">
                <ul className="list-disc space-y-1 pl-4">
                  {result.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {result.warnings.length > 0 && (
              <Notice type="info">
                <ul className="list-disc space-y-1 pl-4">
                  {result.warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {result.ok && (
              <div className="space-y-2 text-sm text-slate-700">
                <p className="font-medium">
                  Sẽ đóng {result.closed.length} lớp cuối cấp ({result.students_dropped} học sinh cho nghỉ) và cho{' '}
                  {result.promoted.length} lớp lên khối.
                </p>
                {result.closed.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Lớp được đóng</p>
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
                      {result.closed.map((item) => (
                        <li key={item.class_id}>
                          {item.name} · khối {item.grade} · {item.students} học sinh nghỉ
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.promoted.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Lớp lên khối</p>
                    <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                      {result.promoted.map((item) => (
                        <li key={item.class_id}>
                          {item.old_name} → <span className="font-medium">{item.new_name}</span> (khối {item.old_grade}{' '}
                          → {item.new_grade})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
        <p className="text-xs font-semibold text-red-700">Bước 3: Chuyển năm học (không hoàn tác được)</p>
        <FormField
          id="rollover-confirm"
          label={`Gõ ${ROLLOVER_CONFIRM_TEXT} để xác nhận`}
          value={confirmText}
          onChange={setConfirmText}
          disabled={!backedUp || !previewOk}
          placeholder={previewOk ? ROLLOVER_CONFIRM_TEXT : 'Hãy xem trước ở Bước 2 trước'}
        />
        <button
          type="button"
          onClick={handleRun}
          disabled={Boolean(busy) || !canRun}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {busy === 'run' ? 'Đang chuyển...' : 'Chuyển năm học'}
        </button>
      </div>
    </section>
  )
}
