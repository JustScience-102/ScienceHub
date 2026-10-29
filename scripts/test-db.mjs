// Chạy toàn bộ test Database: node scripts/test-db.mjs [từ khóa tên file]
// Mỗi file supabase/tests/*.test.mjs xuất mặc định một bộ test:
//   { name, base: 'v2' | 'v3', fresh?: boolean, setup?(ctx), tests: { 'tên': async (ctx) => {} } }
// fresh = true: mỗi test một Database mới (chạy lại setup); mặc định các test trong bộ dùng chung dữ liệu theo thứ tự.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, createContext } from '../supabase/tests/lib/harness.mjs'

const filter = process.argv[2] ?? ''
const testsDir = join(ROOT, 'supabase', 'tests')
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.mjs') && name.includes(filter))
  .sort()

let passed = 0
let failed = 0
const started = Date.now()

for (const file of files) {
  const suite = (await import(pathToFileURL(join(testsDir, file)).href)).default
  console.log(`\n▶ ${suite.name} (${file})`)
  let ctx = null
  try {
    if (!suite.fresh) {
      ctx = await createContext(suite.base)
      if (suite.setup) await suite.setup(ctx)
    }
  } catch (error) {
    failed += 1
    console.log(`  ✗ [chuẩn bị] ${error.message}`)
    if (ctx?.db) await ctx.db.close()
    continue
  }

  for (const [name, fn] of Object.entries(suite.tests)) {
    let testCtx = ctx
    try {
      if (suite.fresh) {
        testCtx = await createContext(suite.base)
        if (suite.setup) await suite.setup(testCtx)
      }
      await fn(testCtx)
      passed += 1
      console.log(`  ✓ ${name}`)
    } catch (error) {
      failed += 1
      console.log(`  ✗ ${name}\n      ${String(error.stack ?? error.message).split('\n').slice(0, 4).join('\n      ')}`)
    } finally {
      if (suite.fresh && testCtx?.db) await testCtx.db.close()
    }
  }
  if (ctx?.db) await ctx.db.close()
}

console.log(`\n${passed} đạt, ${failed} lỗi (${((Date.now() - started) / 1000).toFixed(1)} giây)`)
process.exit(failed > 0 ? 1 : 0)
