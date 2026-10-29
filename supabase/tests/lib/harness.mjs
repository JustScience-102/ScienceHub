// Công cụ chạy test Database trên PGlite (Postgres chạy ngay trong Node, không cần Supabase).
// Mỗi lời gọi của một người dùng (actor.rpc / actor.query) là MỘT giao dịch riêng giống PostgREST:
// đặt vai trò + auth.uid(), chạy lệnh, COMMIT (trigger hoãn chạy lúc này), lỗi thì ROLLBACK.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Ngày, giờ, thời điểm trả về đúng chuỗi Postgres (không đổi sang Date của JS để khỏi lệch múi giờ).
const RAW_PARSERS = { 1082: (v) => v, 1083: (v) => v, 1114: (v) => v, 1184: (v) => v }

export const LEGACY_FILES = [
  '01_schema.sql',
  '02_triggers.sql',
  '03_rpc_and_auth.sql',
  'MANAGER',
  '04_lockdown_rls.sql',
  '05_v2_2_teacher_access.sql',
  '06_v2_3_audit_log.sql',
  '07_v2_4_backup.sql',
  '08_v2_5_bulk_import.sql',
  '09_v2_6_year_rollover.sql',
  '10_v2_7_restore_backup.sql',
]

export const MANAGER_EMAIL = 'quanly@sciencehub.test'

export function readSql(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

// Bộ SQL V3: mọi file "NN_tên.sql" trong supabase/v3, theo thứ tự số.
export function v3Files() {
  return readdirSync(join(ROOT, 'supabase', 'v3'))
    .filter((name) => /^\d{2}_.+\.sql$/.test(name))
    .sort()
}

async function openDb(dump) {
  const db = new PGlite({ parsers: RAW_PARSERS, ...(dump ? { loadDataDir: dump } : {}) })
  await db.exec(`set timezone to 'UTC'`)
  return db
}

async function runFile(db, relativePath) {
  try {
    await db.exec(readSql(relativePath))
  } catch (error) {
    error.message = `[${relativePath}] ${error.message}`
    throw error
  }
}

async function insertAuthUser(db, email) {
  const { rows } = await db.query(
    `insert into auth.users (email, last_sign_in_at) values ($1, now()) returning id`,
    [email],
  )
  return rows[0].id
}

async function buildSnapshot(kind) {
  const db = await openDb()
  await runFile(db, 'supabase/tests/lib/supabase_stub.sql')
  if (kind === 'v2') {
    for (const file of LEGACY_FILES) {
      if (file === 'MANAGER') {
        await insertAuthUser(db, MANAGER_EMAIL)
        await db.query('select public.setup_initial_manager($1)', [MANAGER_EMAIL])
      } else {
        await runFile(db, `supabase/legacy/${file}`)
      }
    }
  } else if (kind === 'v3') {
    for (const file of v3Files()) await runFile(db, `supabase/v3/${file}`)
    await insertAuthUser(db, MANAGER_EMAIL)
    await db.query('select public.setup_initial_manager($1)', [MANAGER_EMAIL])
  } else {
    throw new Error(`Không biết loại Database "${kind}"`)
  }
  const dump = await db.dumpDataDir('none')
  await db.close()
  return dump
}

const snapshots = new Map()

// Database mới từ ảnh chụp (dựng ảnh chụp 1 lần cho mỗi loại trong một lần chạy test).
export async function freshDb(kind) {
  if (!snapshots.has(kind)) snapshots.set(kind, buildSnapshot(kind))
  return openDb(await snapshots.get(kind))
}

function serialize(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

// Một lần gọi API của người dùng = một giao dịch.
async function request(db, who, run) {
  await db.exec('begin')
  try {
    const claims = who.uid ? { sub: who.uid, role: who.role } : { role: who.role }
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true),
              set_config('request.jwt.claims', $3, true)`,
      [who.uid ?? '', who.role, JSON.stringify(claims)],
    )
    await db.exec(`set local role ${who.role}`)
    const result = await run()
    await db.exec('commit')
    return result
  } catch (error) {
    try {
      await db.exec('rollback')
    } catch {
      // giao dịch đã tự hủy khi COMMIT lỗi
    }
    throw error
  }
}

function makeActor(db, uid, role = 'authenticated') {
  const who = { uid, role }
  return {
    uid,
    role,
    async rpc(fn, args = {}) {
      const keys = Object.keys(args)
      const call = `select public.${fn}(${keys.map((key, i) => `${key} => $${i + 1}`).join(', ')}) as result`
      return request(db, who, async () => {
        const { rows } = await db.query(call, keys.map((key) => serialize(args[key])))
        return rows[0]?.result
      })
    },
    async query(text, params = []) {
      return request(db, who, async () => (await db.query(text, params)).rows)
    },
  }
}

export async function createContext(kind) {
  const db = kind ? await freshDb(kind) : null
  const ctx = {
    db,
    // Lệnh chạy bằng quyền chủ Database (giống SQL Editor), không qua RLS.
    async sql(text, params = []) {
      return (await db.query(text, params)).rows
    },
    async one(text, params = []) {
      return (await db.query(text, params)).rows[0]
    },
    async value(text, params = []) {
      const row = (await db.query(text, params)).rows[0]
      return row ? Object.values(row)[0] : undefined
    },
    exec: (text) => db.exec(text),
    anon: db ? makeActor(db, null, 'anon') : null,
    // Người dùng Authentication mới (chưa có vai trò). Trả về actor.
    async createUser(email) {
      return makeActor(db, await insertAuthUser(db, email))
    },
    actor: (uid) => makeActor(db, uid),
    async today() {
      return ctx.value('select public.vn_today()::text')
    },
  }
  if (db) {
    const managerId = await ctx.value('select id from auth.users where email = $1', [MANAGER_EMAIL])
    ctx.manager = makeActor(db, managerId)
  }
  return ctx
}

// Ngày ISO cộng/trừ số ngày (tính theo chuỗi, không lệch múi giờ).
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function monthStartOf(iso) {
  return `${iso.slice(0, 7)}-01`
}
