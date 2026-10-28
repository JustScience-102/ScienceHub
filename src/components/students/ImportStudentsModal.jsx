import { useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import Modal from '../Modal'
import Notice from '../Notice'
import { toVietnameseError } from '../../lib/errors'
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_COLUMN_LABELS,
  downloadClassNameList,
  downloadImportTemplate,
  parseStudentImportText,
  runStudentImport,
} from '../../lib/importStudents'

const MAX_LISTED = 100

function IssueList({ title, items, tone }) {
  if (!items || items.length === 0) return null
  const sorted = [...items].sort((a, b) => a.line - b.line)
  const shown = sorted.slice(0, MAX_LISTED)
  const color = tone === 'error' ? 'text-red-700' : 'text-amber-700'
  return (
    <div>
      <h3 className={`mb-1 text-sm font-semibold ${color}`}>
        {title} ({items.length})
      </h3>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        {shown.map((item, index) => (
          <li key={`${item.line}-${index}`}>
            <span className="font-medium">Dòng {item.line}:</span> {item.message}
          </li>
        ))}
        {sorted.length > shown.length && (
          <li className="text-slate-500">... và {sorted.length - shown.length} mục khác. Hãy sửa các mục trên rồi chọn lại file.</li>
        )}
      </ul>
    </div>
  )
}

// Nhập học sinh hàng loạt từ file CSV: chọn file -> kiểm tra (chưa ghi gì) -> bấm Nhập khi 100% hợp lệ.
export default function ImportStudentsModal({ onDone, onClose }) {
  const fileInput = useRef(null)
  const [rows, setRows] = useState([])
  const [clientWarnings, setClientWarnings] = useState([])
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState(null) // kết quả kiểm tra từ Database
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function resetFile() {
    setRows([])
    setClientWarnings([])
    setFileName('')
    setReport(null)
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setReport(null)
    setError('')
    setBusy(true)
    try {
      const parsed = parseStudentImportText(await file.text())
      if (parsed.error) {
        setError(parsed.error)
        setRows([])
        setFileName('')
        return
      }
      setRows(parsed.rows)
      setClientWarnings(parsed.clientWarnings)
      setFileName(file.name)
      setReport(await runStudentImport(parsed.rows, { dryRun: true }))
    } catch (loadError) {
      setError(toVietnameseError(loadError) || 'Trung tâm chưa đọc được file này. Hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    setBusy(true)
    setError('')
    try {
      const result = await runStudentImport(rows, { dryRun: false })
      if (result.applied) {
        const { summary } = result
        onDone(
          `Trung tâm đã nhập ${summary.enrollments} lượt ghi danh: ${summary.new_students} học sinh mới, ` +
            `${summary.existing_students} học sinh đã có hồ sơ, ${summary.new_parents} phụ huynh mới.`,
        )
        return
      }
      setReport(result) // dữ liệu thay đổi giữa lúc kiểm tra và lúc nhập: hiện lại danh sách lỗi
    } catch (importError) {
      setError(toVietnameseError(importError))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadClasses() {
    setError('')
    try {
      const count = await downloadClassNameList()
      if (count === 0) setError('Trung tâm chưa có lớp nào đang hiển thị. Hãy tạo lớp trước khi nhập học sinh.')
    } catch (downloadError) {
      setError(toVietnameseError(downloadError))
    }
  }

  const warnings = [...clientWarnings, ...(report?.warnings ?? [])]
  const errors = report?.errors ?? []
  const summary = report?.summary
  const canImport = Boolean(report?.ok) && (summary?.enrollments ?? 0) > 0

  return (
    <Modal title="Nhập học sinh từ file" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-semibold">Cách làm</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Tạo sẵn giáo viên và các lớp trên hệ thống (lớp phải có trước khi nhập học sinh).</li>
            <li>Tải file mẫu, điền học sinh vào Excel (mỗi dòng là một học sinh trong một lớp; học nhiều lớp thì thêm dòng).</li>
            <li>Chọn Lưu thành (Save As) → <strong>CSV UTF-8</strong>, rồi chọn file ở bên dưới.</li>
          </ol>
          <p className="mt-2">
            Cột bắt buộc: <strong>Họ và tên học sinh, SĐT phụ huynh, Tên lớp</strong>. Các cột còn lại có thể để trống
            (họ tên phụ huynh để trống sẽ hiện "(Chưa cập nhật tên)", bổ sung sau; ngày vào lớp để trống là hôm nay). Tối đa{' '}
            {MAX_IMPORT_ROWS} dòng mỗi lần.
          </p>
          <p className="mt-1 text-xs text-sky-800">Các cột: {TEMPLATE_COLUMN_LABELS.join(' | ')}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={downloadImportTemplate}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <Download size={16} aria-hidden="true" />
            Tải file mẫu
          </button>
          <button
            type="button"
            onClick={handleDownloadClasses}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <Download size={16} aria-hidden="true" />
            Tải danh sách tên lớp
          </button>
        </div>

        <div>
          <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-slate-700">
            Chọn file CSV
          </label>
          <input
            ref={fileInput}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            disabled={busy}
            className="block w-full min-h-11 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700"
          />
        </div>

        {busy && <p className="text-sm text-slate-500">Trung tâm đang xử lý...</p>}
        {error && <Notice type="error">{error}</Notice>}

        {report && (
          <div className="space-y-3">
            {report.ok ? (
              <Notice type={canImport ? 'success' : 'info'}>
                {canImport ? (
                  <>
                    File <strong>{fileName}</strong> hợp lệ ({rows.length} dòng): {summary.new_students} học sinh mới,{' '}
                    {summary.existing_students} học sinh đã có hồ sơ, {summary.new_parents} phụ huynh mới,{' '}
                    {summary.enrollments} lượt ghi danh
                    {summary.skipped > 0 ? `, ${summary.skipped} dòng bỏ qua` : ''}. Chưa có gì được lưu cho tới khi bạn bấm
                    Nhập.
                  </>
                ) : (
                  <>Không có gì mới để nhập: tất cả học sinh trong file đã đang học đúng các lớp đó.</>
                )}
              </Notice>
            ) : (
              <Notice type="error">
                File có {errors.length} lỗi nên Trung tâm <strong>chưa nhập gì</strong>. Hãy sửa file rồi chọn lại.
              </Notice>
            )}

            {report.missing_classes?.length > 0 && (
              <Notice type="info">
                Cần tạo trước các lớp sau (hoặc sửa tên lớp cho đúng):{' '}
                <strong>{report.missing_classes.join(', ')}</strong>
              </Notice>
            )}

            <IssueList title="Lỗi cần sửa" items={errors} tone="error" />
            <IssueList title="Lưu ý (không chặn nhập)" items={warnings} tone="warning" />
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {fileName && (
            <button
              type="button"
              onClick={resetFile}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              <FileUp size={16} aria-hidden="true" />
              Chọn file khác
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={busy || !canImport}
            className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? 'Đang xử lý...' : `Nhập ${summary?.enrollments ?? 0} lượt ghi danh`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
