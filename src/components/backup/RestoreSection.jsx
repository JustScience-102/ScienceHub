// Khôi phục từ file sao lưu (chỉ Quản lý): chọn file -> tải sao lưu hiện tại -> xem trước -> gõ cụm xác nhận.
// Dữ liệu nghiệp vụ được thay thế HOÀN TOÀN bằng nội dung file. Giữ nguyên tài khoản Quản lý và nhật ký thay đổi.
import { useState } from 'react'
import { Download, RotateCcw, Search } from 'lucide-react'
import Notice from '../Notice'
import FormField from '../FormField'
import { toVietnameseError } from '../../lib/errors'
import { formatVnDateTime } from '../../lib/auditLog'
import { downloadFullCenterBackupJson } from '../../lib/backup'
import {
  RESTORE_CONFIRM_TEXT,
  TABLE_LABELS,
  abortRestore,
  applyRestore,
  parseBackupText,
  previewRestore,
  summarizeBackup,
} from '../../lib/restore'

const SECONDARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50'

export default function RestoreSection() {
  const [fileName, setFileName] = useState('')
  const [backup, setBackup] = useState(null)
  const [summary, setSummary] = useState(null)
  const [backedUp, setBackedUp] = useState(false)
  const [preview, setPreview] = useState(null) // { runId, result }
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)

  const previewOk = preview !== null && preview.result.ok === true
  const canRun = backedUp && previewOk && confirmText.trim() === RESTORE_CONFIRM_TEXT

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
      setProgress(null)
    }
  }

  async function resetPreview() {
    if (preview) await abortRestore(preview.runId)
    setPreview(null)
    setConfirmText('')
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await resetPreview()
    setBackup(null)
    setSummary(null)
    setDone(false)
    setFileName(file.name)
    setNotice(null)
    try {
      const parsed = parseBackupText(await file.text())
      if (parsed.error) {
        setNotice({ type: 'error', text: parsed.error })
        return
      }
      setBackup(parsed.backup)
      setSummary(summarizeBackup(parsed.backup))
    } catch {
      setNotice({ type: 'error', text: 'Trung tâm không đọc được file này. Hãy thử chọn lại.' })
    }
  }

  function handleBackup() {
    return run('backup', async () => {
      const result = await downloadFullCenterBackupJson({ includeAuditLog: true })
      setBackedUp(true)
      setNotice({ type: 'success', text: `Trung tâm đã tải bản sao lưu hiện tại: ${result.filename}. Hãy giữ file này phòng khi cần quay lại.` })
    })
  }

  function handlePreview() {
    return run('preview', async () => {
      await resetPreview()
      const outcome = await previewRestore(backup, setProgress)
      setPreview(outcome)
    })
  }

  function handleRun() {
    return run('run', async () => {
      const result = await applyRestore(preview.runId, confirmText)
      setPreview(null)
      setConfirmText('')
      setDone(true)
      setNotice({
        type: 'success',
        text: `Trung tâm đã khôi phục dữ liệu từ file sao lưu xuất lúc ${formatVnDateTime(result.file?.exported_at)}. Hãy tải lại trang để thấy dữ liệu mới.`,
      })
    })
  }

  const result = preview?.result

  return (
    <section className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
      <div className="flex items-start gap-2">
        <RotateCcw size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">6. Khôi phục từ file sao lưu</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Đưa dữ liệu về <strong>đúng trạng thái trong file</strong>: học sinh, lớp, điểm danh... phát sinh sau thời
            điểm sao lưu sẽ mất, dữ liệu trong file được trả lại đầy đủ. Tài khoản Quản lý và Nhật ký thay đổi được
            giữ nguyên (nhật ký chỉ ghi thêm một dòng). Tài khoản Giáo viên trong file được nối theo email với tài khoản
            đăng nhập đang có. Nhận cả file sao lưu của hệ thống cũ để chuyển dữ liệu sang hệ thống mới.
          </p>
        </div>
      </div>

      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {done ? (
        <button type="button" onClick={() => window.location.reload()} className={PRIMARY_BTN}>
          Tải lại trang
        </button>
      ) : (
        <>
          <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Bước 1: Chọn file sao lưu (.json)</p>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              disabled={Boolean(busy)}
              aria-label="Chọn file sao lưu"
              className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
            />
            {summary && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-medium">
                  {fileName} · xuất lúc {formatVnDateTime(summary.exportedAt)}
                  {summary.version ? ` · phiên bản ${summary.version}` : ''}
                </p>
                <p>
                  {Object.entries(summary.counts)
                    .map(([name, count]) => `${TABLE_LABELS[name]}: ${count}`)
                    .join(' · ')}
                </p>
                {!summary.hasClassVersions && (
                  <p className="text-amber-700">File cũ không có lịch sử nhãn lớp: phần này sẽ được làm trống.</p>
                )}
                {!summary.hasProfiles && (
                  <p className="text-amber-700">
                    File không có danh sách tài khoản: tài khoản giáo viên hiện tại sẽ bị gỡ (phải liên kết lại).
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Bước 2: Tải sao lưu dữ liệu hiện tại (để còn đường quay lại)</p>
            <button type="button" onClick={handleBackup} disabled={Boolean(busy) || !backup} className={PRIMARY_BTN}>
              <Download size={16} aria-hidden="true" />
              {busy === 'backup' ? 'Đang tạo file...' : 'Tải bản sao lưu hiện tại (.json)'}
            </button>
            {backedUp && <p className="text-xs font-medium text-emerald-700">Đã tải bản sao lưu hiện tại.</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Bước 3: Xem trước (không thay đổi gì)</p>
            <button
              type="button"
              onClick={handlePreview}
              disabled={Boolean(busy) || !backup || !backedUp}
              className={SECONDARY_BTN}
            >
              <Search size={16} aria-hidden="true" />
              {busy === 'preview'
                ? progress
                  ? `Đang tải file lên ${progress.done}/${progress.total}...`
                  : 'Đang kiểm tra...'
                : 'Tải file lên và xem trước'}
            </button>

            {result && (
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
                {(result.renamed ?? []).length > 0 && (
                  <Notice type="info">
                    <p className="font-medium">
                      {result.renamed.length} lớp sẽ được đặt lại tên theo quy tắc Môn_Khối_TênGV_STT:
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {result.renamed.map((row) => (
                        <li key={`${row.old_name}->${row.new_name}`}>
                          {row.old_name} → <strong>{row.new_name}</strong>
                        </li>
                      ))}
                    </ul>
                  </Notice>
                )}
                {result.tables.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1.5 pr-3 font-medium">Dữ liệu</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Hiện có</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Trong file</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Được trả lại</th>
                          <th className="py-1.5 text-right font-medium">Sẽ mất</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.tables.map((row) => (
                          <tr key={row.name} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 text-slate-700">{TABLE_LABELS[row.name] ?? row.name}</td>
                            <td className="py-1.5 pr-3 text-right">{row.current}</td>
                            <td className="py-1.5 pr-3 text-right">{row.in_file}</td>
                            <td className="py-1.5 pr-3 text-right text-emerald-700">{row.added}</td>
                            <td className={`py-1.5 text-right ${row.removed > 0 ? 'font-semibold text-red-600' : ''}`}>
                              {row.removed}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-red-300 bg-white p-3">
            <p className="text-xs font-semibold text-red-700">Bước 4: Khôi phục (dữ liệu hiện tại sẽ bị thay thế)</p>
            <FormField
              id="restore-confirm"
              label={`Gõ ${RESTORE_CONFIRM_TEXT} để xác nhận`}
              value={confirmText}
              onChange={setConfirmText}
              disabled={!backedUp || !previewOk}
              placeholder={previewOk ? RESTORE_CONFIRM_TEXT : 'Hãy xem trước ở Bước 3 trước'}
            />
            <button
              type="button"
              onClick={handleRun}
              disabled={Boolean(busy) || !canRun}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy === 'run' ? 'Đang khôi phục...' : 'Khôi phục từ file sao lưu'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
