// Phần "Tra cứu điểm" của trang chủ (#tra-cuu-diem; tiêu đề h2 nằm trong khung nên phần không có PartHeader):
// giao diện trang /phu-huynh của app giao bài (ScienceApp, web/pages/ParentPage.tsx) viết lại theo mẫu của web.
// Dữ liệu, kiểm tra mã HS + SĐT, khóa khi nhập sai và phiên 90 ngày đều do máy chủ ScienceApp xử lý: web gọi /api/diem/*
// và được chuyển tiếp sang /api/parent/* (site/vercel.json), nên cookie phiên nằm trên tên miền web.
import { useEffect, useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { api } from '../lib/api.js'
import { MIN_CLASS_AVG, SUBJECT_NAMES, scoreText, vnDate } from '../lib/parentLookup.js'

const BTN_PRIMARY =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-base font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60'
const BTN_SECONDARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50'
const INPUT =
  'w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'
const SUBJECT_TAG = { VL: 'bg-physics-100 text-physics-800', HH: 'bg-chem-100 text-chem-800' }

function chipClass(on) {
  return `inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  }`
}

export default function ScoreLookup() {
  // undefined: đang tải; null: chưa đăng nhập; object: dữ liệu điểm.
  const [view, setView] = useState(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api('/api/diem/view')
      .then((data) => {
        if (!cancelled) setView(data ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setView(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (view === undefined) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-base text-slate-500">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Đang tải…
      </p>
    )
  }
  if (!view) return <LoginForm onDone={setView} initialError={error} />
  return (
    <Results
      view={view}
      onLogout={async () => {
        await api('/api/diem/logout', { method: 'POST' }).catch(() => {})
        setError('')
        setView(null)
      }}
    />
  )
}

function LoginForm({ onDone, initialError }) {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onDone(await api('/api/diem/login', { method: 'POST', body: { code, phone } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Tra cứu điểm</h2>
        <p className="mt-1 text-sm text-slate-500">Dành cho phụ huynh học sinh Lớp học ScienceHub.</p>
      </div>

      <div>
        <label htmlFor="lookup-code" className="mb-1 block text-sm font-medium text-slate-700">
          Mã học sinh của con
        </label>
        <input
          id="lookup-code"
          className={INPUT}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          placeholder="HS0123"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <p className="mt-1 text-xs text-slate-500">Mã con dùng để đăng nhập app bài tập: HS và 4 chữ số.</p>
      </div>

      <div>
        <label htmlFor="lookup-phone" className="mb-1 block text-sm font-medium text-slate-700">
          Số điện thoại phụ huynh
        </label>
        <input
          id="lookup-phone"
          className={INPUT}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0912345678"
          autoComplete="tel"
          required
        />
        <p className="mt-1 text-xs text-slate-500">Số phụ huynh đã đăng ký khi con nhập học.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" className={BTN_PRIMARY} disabled={busy}>
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
        {busy ? 'Đang kiểm tra…' : 'Xem điểm'}
      </button>

      <p className="text-xs text-slate-500">
        Máy này sẽ nhớ đăng nhập 90 ngày. Dùng máy của người khác thì bấm “Thoát” khi xem xong.
      </p>
    </form>
  )
}

function Results({ view, onLogout }) {
  const [childIdx, setChildIdx] = useState(0)
  const [subject, setSubject] = useState('all')
  const children = view.children ?? []
  const child = children[Math.min(childIdx, children.length - 1)]
  const childItems = child?.items ?? []
  // Vật Lí trước Hóa học (giống app giao bài).
  const subjects = [...new Set(childItems.map((i) => i.subject).filter(Boolean))].sort().reverse()
  const items = childItems.filter((i) => subject === 'all' || i.subject === subject)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Tra cứu điểm</h2>
        <button type="button" className={BTN_SECONDARY} onClick={onLogout}>
          <LogOut size={16} aria-hidden="true" />
          Thoát
        </button>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn con">
          {children.map((c, i) => (
            <button
              key={c.code}
              type="button"
              role="tab"
              aria-selected={i === childIdx}
              className={chipClass(i === childIdx)}
              onClick={() => {
                setChildIdx(i)
                setSubject('all')
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {child && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-800">{child.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Mã học sinh {child.code} ·{' '}
            {childItems.length ? `${childItems.length} bài kiểm tra` : 'chưa có bài kiểm tra'}
          </p>
          {subjects.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo môn">
              {['all', ...subjects].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={subject === s}
                  className={chipClass(subject === s)}
                  onClick={() => setSubject(s)}
                >
                  {s === 'all' ? 'Tất cả môn' : (SUBJECT_NAMES[s] ?? s)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {child && childItems.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-base text-slate-600 shadow-sm">
          Con chưa có bài kiểm tra nào. Khi con làm bài kiểm tra, điểm sẽ hiện ở đây.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((it) => (
          <ResultCard key={it.assignmentId} it={it} />
        ))}
      </ul>

      <p className="text-xs text-slate-500">
        Trang chỉ hiện các bài kiểm tra; bài luyện tập ở lớp và ở nhà không hiện. Điểm là điểm lần làm đầu. Điểm trung
        bình lớp tính trên các bạn cùng lớp đã làm bài, chỉ hiện khi lớp có từ {MIN_CLASS_AVG} bạn làm.
      </p>
    </div>
  )
}

function ResultCard({ it }) {
  return (
    <li className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800">{it.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {it.subject && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUBJECT_TAG[it.subject] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {SUBJECT_NAMES[it.subject] ?? it.subject}
            </span>
          )}
          <span>Làm ngày {vnDate(it.doneAt)}</span>
        </p>
        {it.score10 !== null && (
          <p className="mt-1 text-sm text-slate-600">
            {it.classAvg ? (
              <>
                Điểm trung bình lớp: <b className="text-slate-800">{scoreText(it.classAvg.value)}</b> (
                {it.classAvg.n} bạn làm bài)
              </>
            ) : (
              <span className="text-slate-400">Chưa có điểm trung bình lớp</span>
            )}
          </p>
        )}
      </div>
      <div
        className="shrink-0 text-right"
        aria-label={it.score10 !== null ? `Điểm ${scoreText(it.score10)} trên 10` : undefined}
      >
        {it.score10 !== null ? (
          <>
            <b className="text-3xl font-bold text-slate-800">{scoreText(it.score10)}</b>
            <span className="text-sm text-slate-500">/10</span>
          </>
        ) : it.floors ? (
          <>
            <b className="block text-2xl font-bold text-slate-800">
              {it.floors.passed}/{it.floors.total}
            </b>
            <span className="text-xs text-slate-500">tầng đã qua</span>
          </>
        ) : null}
      </div>
    </li>
  )
}
