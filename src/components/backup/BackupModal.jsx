// Sao lưu dữ liệu & Chu kỳ Năm học (15/06 -> 12/06) dành cho Quản lý.
// 1) Sao lưu toàn hệ thống (.json)  2) Xuất bảng tính Excel (.csv)
// 3) Kết thúc Năm học: tải nhật ký đến ngày chốt, rồi mới được xóa đúng phần đã tải.
import { useState } from 'react'
import { ArchiveRestore, Download, FileSpreadsheet } from 'lucide-react'
import Modal from '../Modal'
import Notice from '../Notice'
import FormField from '../FormField'
import SelectField from '../SelectField'
import { toVietnameseError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { todayISO } from '../../lib/schedule'
import { monthOf } from '../../lib/tuition'
import { clearAuditLogsBefore, getCurrentSchoolYearBounds, latestSchoolYearEnd } from '../../lib/auditLog'
import {
  downloadAuditBackup,
  downloadClassesCsv,
  downloadFullCenterBackupJson,
  downloadMonthlyAttendanceTuitionCsv,
  downloadStudentsCsv,
} from '../../lib/backup'

const CONFIRM_TEXT = 'XOA NHAT KY'
const SECONDARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50'

export default function BackupModal({ onClose }) {
  const today = todayISO()
  const current = monthOf(today)
  const schoolYear = getCurrentSchoolYearBounds(today)

  const [includeAudit, setIncludeAudit] = useState(true)
  const [reportYear, setReportYear] = useState(String(current.year))
  const [reportMonth, setReportMonth] = useState(String(current.month))

  // Kết thúc năm học: một ngày chốt dùng chung cho cả tải file và xóa.
  const [cutoff, setCutoff] = useState(latestSchoolYearEnd(today))
  const [backup, setBackup] = useState(null) // { beforeDate, count } của file vừa tải
  const [confirmText, setConfirmText] = useState('')

  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)

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

  const reportYearNumber = Number(reportYear)
  const reportValid =
    Number.isInteger(reportYearNumber) && reportYearNumber >= 2020 && reportYearNumber <= 2100 && Boolean(reportMonth)

  const cutoffValid = Boolean(cutoff) && cutoff < today
  // Chỉ được xóa khi file sao lưu vừa tải đúng với ngày chốt đang chọn.
  const backedUp = backup !== null && backup.beforeDate === cutoff
  const canClear = backedUp && backup.count > 0 && confirmText.trim() === CONFIRM_TEXT

  function changeCutoff(value) {
    setCutoff(value)
    setBackup(null)
    setConfirmText('')
  }

  function handleFullBackup() {
    return run('full', async () => {
      const result = await downloadFullCenterBackupJson({ includeAuditLog: includeAudit })
      setNotice({ type: 'success', text: `Trung tâm đã tải bản sao lưu toàn hệ thống: ${result.filename}` })
    })
  }

  function handleStudents() {
    return run('students', async () => {
      const result = await downloadStudentsCsv()
      setNotice({ type: 'success', text: `Đã xuất ${result.count} học sinh (${result.filename}).` })
    })
  }

  function handleClasses() {
    return run('classes', async () => {
      const result = await downloadClassesCsv()
      setNotice({ type: 'success', text: `Đã xuất ${result.count} lớp học (${result.filename}).` })
    })
  }

  function handleMonthly() {
    return run('monthly', async () => {
      const result = await downloadMonthlyAttendanceTuitionCsv(reportYearNumber, Number(reportMonth))
      setNotice({
        type: 'success',
        text: `Đã xuất bảng điểm danh và học phí tháng ${reportMonth}/${reportYear} (${result.count} dòng, ${result.filename}).`,
      })
    })
  }

  function handleAuditBackup(format) {
    return run(`audit_${format}`, async () => {
      const result = await downloadAuditBackup({ beforeDate: cutoff, format })
      if (result.count === 0) {
        setBackup(null)
        setNotice({
          type: 'info',
          text: `Không có dòng nhật ký nào đến hết ngày ${formatDate(cutoff)}, không cần xóa.`,
        })
        return
      }
      setBackup({ beforeDate: cutoff, count: result.count })
      setNotice({
        type: 'success',
        text: `Đã tải ${result.count} dòng nhật ký đến hết ngày ${formatDate(cutoff)} (${result.filename}). Hãy mở file kiểm tra, sau đó làm Bước 2.`,
      })
    })
  }

  function handleClear() {
    return run('clear', async () => {
      const deleted = await clearAuditLogsBefore({
        beforeDate: backup.beforeDate,
        expectedCount: backup.count,
        confirmText,
      })
      setBackup(null)
      setConfirmText('')
      setNotice({
        type: 'success',
        text: `Trung tâm đã xóa ${deleted} dòng nhật ký đến hết ngày ${formatDate(cutoff)}. Nhật ký mới vẫn được ghi bình thường.`,
      })
    })
  }

  return (
    <Modal title="Sao lưu dữ liệu & Năm học" onClose={onClose}>
      <div className="space-y-5">
        {notice && (
          <Notice type={notice.type} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">1. Sao lưu toàn bộ cơ sở dữ liệu (.json)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Một file chứa phụ huynh, giáo viên, học sinh, lớp, lịch học, ghi danh, điểm danh và tài khoản. File
              có thông tin cá nhân, hãy cất ở nơi an toàn.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeAudit}
              onChange={(event) => setIncludeAudit(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Kèm cả nhật ký thay đổi
          </label>
          <button type="button" onClick={handleFullBackup} disabled={Boolean(busy)} className={PRIMARY_BTN}>
            <Download size={16} aria-hidden="true" />
            {busy === 'full' ? 'Đang tạo file...' : 'Tải bản sao lưu (.json)'}
          </button>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">2. Xuất bảng tính Excel (.csv)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Học sinh sắp theo tên gọi. Học phí cộng từ đơn giá đã lưu lúc điểm danh, không tính lại theo giá hiện
              tại của lớp.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={handleStudents} disabled={Boolean(busy)} className={SECONDARY_BTN}>
              <FileSpreadsheet size={16} className="text-emerald-600" aria-hidden="true" />
              {busy === 'students' ? 'Đang xuất...' : 'Học sinh & Phụ huynh'}
            </button>
            <button type="button" onClick={handleClasses} disabled={Boolean(busy)} className={SECONDARY_BTN}>
              <FileSpreadsheet size={16} className="text-sky-600" aria-hidden="true" />
              {busy === 'classes' ? 'Đang xuất...' : 'Lớp học & Lịch học'}
            </button>
          </div>
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3 sm:items-end">
            <SelectField id="backup-month" label="Tháng" value={reportMonth} onChange={setReportMonth} placeholder="Chọn tháng">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={String(month)}>
                  Tháng {month}
                </option>
              ))}
            </SelectField>
            <FormField
              id="backup-year"
              label="Năm"
              type="number"
              inputMode="numeric"
              value={reportYear}
              onChange={setReportYear}
            />
            <button
              type="button"
              onClick={handleMonthly}
              disabled={Boolean(busy) || !reportValid}
              className={PRIMARY_BTN}
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              {busy === 'monthly' ? 'Đang xuất...' : 'Điểm danh & Học phí'}
            </button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-2">
            <ArchiveRestore size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-slate-800">3. Kết thúc Năm học: làm mới nhật ký</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                {schoolYear.label}. Để giải phóng dung lượng, tải nhật ký đến một ngày chốt về máy rồi mới xóa đúng
                phần đã tải. Trung tâm không xóa được nếu chưa tải, và chỉ xóa nhật ký đến hết ngày chốt (ngày đã
                qua).
              </p>
            </div>
          </div>

          <FormField
            id="backup-cutoff"
            label="Ngày chốt nhật ký (xóa đến hết ngày này)"
            type="date"
            value={cutoff}
            onChange={changeCutoff}
            error={cutoff && !cutoffValid ? 'Ngày chốt phải là một ngày đã qua, không phải hôm nay hoặc tương lai.' : ''}
            hint="Gợi ý: 12/06 cuối cùng của Năm học vừa kết thúc."
          />

          <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Bước 1: Tải nhật ký đến hết ngày {formatDate(cutoff)}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => handleAuditBackup('json')}
                disabled={Boolean(busy) || !cutoffValid}
                className={PRIMARY_BTN}
              >
                <Download size={16} aria-hidden="true" />
                {busy === 'audit_json' ? 'Đang tải...' : 'Tải nhật ký (.json)'}
              </button>
              <button
                type="button"
                onClick={() => handleAuditBackup('csv')}
                disabled={Boolean(busy) || !cutoffValid}
                className={SECONDARY_BTN}
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                {busy === 'audit_csv' ? 'Đang tải...' : 'Tải nhật ký (.csv Excel)'}
              </button>
            </div>
            {backedUp && (
              <p className="text-xs font-medium text-emerald-700">
                Đã tải {backup.count} dòng. Bước 2 sẽ chỉ xóa đúng {backup.count} dòng này.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
            <p className="text-xs font-semibold text-red-700">Bước 2: Xóa nhật ký đã sao lưu (không khôi phục được)</p>
            <FormField
              id="backup-confirm"
              label={`Gõ ${CONFIRM_TEXT} để xác nhận`}
              value={confirmText}
              onChange={setConfirmText}
              disabled={!backedUp}
              placeholder={backedUp ? CONFIRM_TEXT : 'Hãy tải file ở Bước 1 trước'}
            />
            <button
              type="button"
              onClick={handleClear}
              disabled={Boolean(busy) || !canClear}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy === 'clear' ? 'Đang xóa...' : 'Xóa nhật ký đã sao lưu'}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
