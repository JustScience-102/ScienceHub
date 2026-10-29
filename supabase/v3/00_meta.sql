-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 00: NỀN TẢNG
-- Chạy ĐẦU TIÊN trên project Supabase MỚI (SQL Editor). Chạy lại nhiều lần vẫn an toàn.
-- Thứ tự bộ V3: 00 -> 01 -> 02 -> ... -> 09, sau đó bootstrap_manager.sql.
--
-- Nội dung:
--   1. Thu quyền MẶC ĐỊNH mà Supabase tự cấp cho anon/authenticated trên mọi bảng, hàm,
--      sequence mới trong schema public. Từ đây chỉ file 09_grants.sql cấp quyền, có danh sách rõ ràng.
--   2. Bảng schema_migrations: ghi phiên bản bộ SQL đã chạy.
--   3. Hàm thời gian theo giờ Việt Nam và cờ nội bộ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quyền mặc định
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
-- Postgres mặc định cấp EXECUTE cho PUBLIC ở cấp TOÀN CỤC (không thu được bằng "in schema"), nên thu riêng.
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- 2. Phiên bản bộ SQL
-- ---------------------------------------------------------------------
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now(),
  note       text
);

alter table public.schema_migrations enable row level security;

-- ---------------------------------------------------------------------
-- 3. Thời gian theo múi giờ Asia/Ho_Chi_Minh
-- ---------------------------------------------------------------------
create or replace function public.vn_today()
returns date
language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create or replace function public.vn_month_start(p_date date default public.vn_today())
returns date
language sql stable as $$
  select date_trunc('month', p_date)::date;
$$;

-- Thứ của ScienceHub: 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật
create or replace function public.vn_day_of_week(p_date date)
returns smallint
language sql immutable as $$
  select (extract(isodow from p_date)::integer + 1)::smallint;
$$;

-- Ngày dạng DD/MM/YYYY cho thông báo lỗi
create or replace function public._fmt_date(p_date date)
returns text
language sql immutable as $$
  select to_char(p_date, 'DD/MM/YYYY');
$$;

-- Tiền VNĐ có dấu chấm: 100000 -> '100.000đ'
create or replace function public._fmt_vnd(p_amount bigint)
returns text
language sql immutable as $$
  select replace(to_char(coalesce(p_amount, 0), 'FM999,999,999,999'), ',', '.') || 'đ';
$$;

-- Khôi phục từ file sao lưu đang chạy trong giao dịch này: các trigger nghiệp vụ tạm bỏ qua kiểm tra.
-- Cờ chỉ do _restore_apply đặt (set_config cục bộ giao dịch); người dùng API không đặt được biến này.
create or replace function public._is_restoring()
returns boolean
language sql stable as $$
  select coalesce(current_setting('sciencehub.restoring', true), '') = 'on';
$$;
