// Cài bộ V3 trên Database trống và kiểm danh mục quyền/bảo mật (thay cho check_before_launch.sql của V2).
import { assert } from './lib/assert.mjs'

const BUSINESS_TABLES = [
  'parents', 'teachers', 'students', 'classes', 'class_schedules', 'class_enrollments',
  'attendance_records', 'profiles', 'class_versions', 'month_closures', 'audit_log',
]

export default {
  name: 'V3: cài đặt & danh mục quyền',
  base: 'v3',
  tests: {
    'Cài xong, có Quản lý và ghi phiên bản V3.0': async (ctx) => {
      assert.equal(await ctx.value(`select count(*)::int from public.profiles where role = 'manager' and active`), 1)
      assert.equal(await ctx.value(`select count(*)::int from public.schema_migrations where version = 'V3.0'`), 1)
    },

    'Mọi bảng trong public đều bật RLS': async (ctx) => {
      const rows = await ctx.sql(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
      assert.deepEqual(rows, [])
    },

    'Chỉ có policy SELECT, không policy mở nào': async (ctx) => {
      const rows = await ctx.sql(`select tablename, policyname, cmd from pg_policies where schemaname = 'public' and cmd <> 'SELECT'`)
      assert.deepEqual(rows, [])
      assert.equal(await ctx.value(`select count(*)::int from pg_policies where schemaname = 'public' and 'anon' = any (roles)`), 0)
    },

    'authenticated không có quyền ghi trên bất kỳ bảng nào; anon không có quyền gì': async (ctx) => {
      const rows = await ctx.sql(`
        select c.relname, r.role, p.priv
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join (values ('anon'), ('authenticated')) r(role)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
        where n.nspname = 'public' and c.relkind in ('r', 'v')
          and has_table_privilege(r.role, c.oid, p.priv)
          and not (r.role = 'authenticated' and p.priv = 'SELECT')`)
      assert.deepEqual(rows, [])
      for (const table of BUSINESS_TABLES) {
        assert.equal(await ctx.value(`select has_table_privilege('authenticated', 'public.${table}', 'SELECT')`), true, table)
      }
      assert.equal(await ctx.value(`select has_table_privilege('authenticated', 'public.restore_staging', 'SELECT')`), false)
    },

    'anon không gọi được hàm nào; hàm nội bộ "_" và setup_initial_manager không mở cho authenticated': async (ctx) => {
      const anon = await ctx.sql(`
        select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)
      assert.deepEqual(anon, [])
      const internal = await ctx.sql(`
        select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname ~ '^_' or p.proname = 'setup_initial_manager')
          and has_function_privilege('authenticated', p.oid, 'execute')`)
      assert.deepEqual(internal, [])
    },

    'Hàm/bảng tạo mới sau này không tự cấp quyền cho anon/authenticated': async (ctx) => {
      await ctx.exec(`create function public.zz_probe() returns int language sql as 'select 1'; create table public.zz_probe_t (id int);`)
      assert.equal(await ctx.value(`select has_function_privilege('anon', 'public.zz_probe()', 'execute')`), false)
      assert.equal(await ctx.value(`select has_table_privilege('authenticated', 'public.zz_probe_t', 'INSERT')`), false)
      await ctx.exec(`drop function public.zz_probe(); drop table public.zz_probe_t;`)
    },

    'Mọi hàm SECURITY DEFINER đều cố định search_path': async (ctx) => {
      const rows = await ctx.sql(`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)
      assert.deepEqual(rows, [])
    },

    'Mỗi hàm chỉ có đúng một phiên bản (không định nghĩa chồng)': async (ctx) => {
      const rows = await ctx.sql(`
        select p.proname, count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' group by p.proname having count(*) > 1`)
      assert.deepEqual(rows, [])
    },

    'check_v3.sql: các mục "Mong đợi: 0 dòng" đều rỗng': async (ctx) => {
      const { readSql } = await import('./lib/harness.mjs')
      const results = await ctx.exec(readSql('supabase/v3/check_v3.sql'))
      assert.equal(results.length, 11)
      assert.ok(results[0].rows.some((r) => r.version === 'V3.0'))
      assert.ok(Number(results[1].rows[0].manager_active) >= 1)
      for (const index of [2, 3, 4, 5, 6, 7, 8, 9]) {
        assert.deepEqual(results[index].rows, [], `mục ${index + 1}`)
      }
    },

    'Chạy lại toàn bộ bộ V3 lần nữa vẫn thành công (idempotent)': async (ctx) => {
      const { readSql, v3Files } = await import('./lib/harness.mjs')
      for (const file of v3Files()) await ctx.exec(readSql(`supabase/v3/${file}`))
      assert.equal(await ctx.value(`select count(*)::int from public.profiles where role = 'manager'`), 1)
    },
  },
}
