-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 06: RPC QUẢN TRỊ (GIÁO VIÊN, TÀI KHOẢN, KHÓA SỔ THÁNG)
-- Chạy sau 05_rpc_core.sql. Chạy lại an toàn. Mọi hàm ở đây chỉ Quản lý gọi được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Giáo viên (V2 ghi thẳng bảng teachers từ trình duyệt; V3 chỉ qua RPC)
-- ---------------------------------------------------------------------
create or replace function public.save_teacher(
  p_teacher_id uuid,
  p_full_name  text,
  p_phone      text,
  p_email      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id    uuid;
begin
  perform public.assert_manager();

  if v_name = '' then
    raise exception 'Trung tâm: Vui lòng nhập họ tên giáo viên.';
  end if;
  perform public._assert_phone(v_phone, 'SĐT giáo viên');
  if v_phone is not null and exists (
    select 1 from public.teachers where phone = v_phone and (p_teacher_id is null or id <> p_teacher_id)
  ) then
    raise exception 'Trung tâm: Số điện thoại % đã thuộc về một giáo viên khác (có thể giáo viên đó đã bị ẩn: bật "Hiện cả giáo viên đã ẩn" rồi bấm "Khôi phục").', v_phone;
  end if;

  if p_teacher_id is null then
    insert into public.teachers (full_name, phone, email) values (v_name, v_phone, v_email)
    returning id into v_id;
  else
    update public.teachers
    set full_name = v_name, phone = v_phone, email = v_email
    where id = p_teacher_id
      and (full_name, phone, email) is distinct from (v_name, v_phone, v_email);
    if not exists (select 1 from public.teachers where id = p_teacher_id) then
      raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
    end if;
    v_id := p_teacher_id;
  end if;
  return v_id;
end;
$$;

-- Ẩn / khôi phục giáo viên. Chỉ ẩn được khi không còn lớp đang hiển thị (trigger chặn);
-- ẩn thì tài khoản tự khóa, khôi phục không tự mở lại tài khoản.
create or replace function public.set_teacher_hidden(p_teacher_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();
  if p_hidden is null then
    raise exception 'Trung tâm: Vui lòng chọn ẩn hoặc khôi phục giáo viên.';
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
  end if;
  if p_hidden then
    update public.teachers set deleted_at = now() where id = p_teacher_id and deleted_at is null;
  else
    update public.teachers set deleted_at = null where id = p_teacher_id and deleted_at is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tài khoản đăng nhập của Giáo viên
-- ---------------------------------------------------------------------

-- Liên kết user trong Supabase Authentication (theo email) với một giáo viên.
-- Giáo viên đã có tài khoản khác thì thay bằng tài khoản mới (tài khoản cũ mất quyền vào hệ thống).
create or replace function public.link_teacher_account(p_email text, p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_user_id  uuid;
  v_deleted  timestamptz;
  v_prof     public.profiles%rowtype;
  v_replaced boolean := false;
begin
  perform public.assert_manager();

  if v_email = '' then
    raise exception 'Trung tâm: Vui lòng nhập email của tài khoản giáo viên.';
  end if;
  select t.deleted_at into v_deleted from public.teachers t where t.id = p_teacher_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
  end if;
  if v_deleted is not null then
    raise exception 'Trung tâm: Giáo viên này đang bị ẩn, vui lòng khôi phục giáo viên trước khi liên kết tài khoản.';
  end if;

  select u.id into v_user_id from auth.users u where lower(u.email) = v_email limit 1;
  if v_user_id is null then
    raise exception 'Trung tâm: Không tìm thấy tài khoản Authentication nào với email %. Vui lòng tạo người dùng trong Supabase Authentication trước.', v_email;
  end if;

  select * into v_prof from public.profiles where user_id = v_user_id;
  if found then
    if v_prof.role = 'manager' then
      raise exception 'Trung tâm: Email % đang là tài khoản Quản lý, không thể liên kết làm tài khoản Giáo viên.', v_email;
    end if;
    if v_prof.teacher_id is distinct from p_teacher_id then
      raise exception 'Trung tâm: Email % đang được liên kết với một giáo viên khác. Mỗi tài khoản chỉ gắn với một giáo viên.', v_email;
    end if;
  end if;

  delete from public.profiles where teacher_id = p_teacher_id and user_id <> v_user_id;
  v_replaced := found;

  insert into public.profiles (user_id, role, teacher_id, active)
  values (v_user_id, 'teacher', p_teacher_id, true)
  on conflict (user_id) do update set role = 'teacher', teacher_id = excluded.teacher_id, active = true;

  update public.teachers set email = v_email where id = p_teacher_id and email is distinct from v_email;

  return jsonb_build_object('user_id', v_user_id, 'email', v_email, 'role', 'teacher',
                            'teacher_id', p_teacher_id, 'active', true, 'replaced', v_replaced);
end;
$$;

create or replace function public.set_teacher_account_active(p_teacher_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
begin
  perform public.assert_manager();
  if p_active is null then
    raise exception 'Trung tâm: Vui lòng chọn trạng thái tài khoản.';
  end if;
  select t.deleted_at into v_deleted from public.teachers t where t.id = p_teacher_id;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy giáo viên này.';
  end if;
  if p_active and v_deleted is not null then
    raise exception 'Trung tâm: Giáo viên này đang bị ẩn, vui lòng khôi phục giáo viên trước khi mở khóa tài khoản.';
  end if;

  update public.profiles set active = p_active where teacher_id = p_teacher_id and role = 'teacher';
  if not found then
    raise exception 'Trung tâm: Giáo viên này chưa được liên kết tài khoản đăng nhập.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Khóa sổ theo tháng
--    Chốt: chỉ tháng đã qua. Sau khi chốt, không ai thêm/sửa/xóa điểm danh (kể cả học bù và xóa điểm
--    danh khi cho nghỉ/đổi lớp) có ngày trong tháng đó. Mở lại: bắt buộc ghi lý do vào nhật ký.
-- ---------------------------------------------------------------------
create or replace function public.close_month(p_year integer, p_month integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start   date;
  v_name    text;
  v_revenue bigint;
  v_charged integer;
begin
  perform public.assert_manager();
  if p_year is null or p_month is null or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Trung tâm: Tháng hoặc năm không hợp lệ.';
  end if;
  v_start := make_date(p_year, p_month, 1);
  if v_start >= public.vn_month_start() then
    raise exception 'Trung tâm: Chỉ chốt sổ được tháng đã qua (tháng %/% chưa kết thúc).', p_month, p_year;
  end if;
  if public.month_is_closed(v_start) then
    raise exception 'Trung tâm: Tháng %/% đã được chốt sổ trước đó.', p_month, p_year;
  end if;

  select coalesce(sum(price_snapshot) filter (where status <> 'absent_excused'), 0),
         count(*) filter (where status <> 'absent_excused')
    into v_revenue, v_charged
  from public.attendance_records
  where attendance_date >= v_start and attendance_date < (v_start + interval '1 month')::date;

  select coalesce('Quản lý (' || u.email || ')', 'Quản lý') into v_name from auth.users u where u.id = auth.uid();

  insert into public.month_closures (month_start, closed_by, closed_by_name)
  values (v_start, auth.uid(), coalesce(v_name, 'Quản lý'));

  perform public._write_audit_log(
    'month_close', 'month_closures', null, null, null,
    format('Chốt sổ tháng %s/%s: %s buổi tính phí, tổng %s', p_month, p_year, v_charged, public._fmt_vnd(v_revenue)),
    null,
    jsonb_build_object('month_start', v_start, 'charged_sessions', v_charged, 'revenue', v_revenue)
  );

  return jsonb_build_object('month_start', v_start, 'charged_sessions', v_charged, 'revenue', v_revenue);
end;
$$;

create or replace function public.reopen_month(p_year integer, p_month integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start  date;
  v_reason text := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
begin
  perform public.assert_manager();
  if p_year is null or p_month is null or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Trung tâm: Tháng hoặc năm không hợp lệ.';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Trung tâm: Vui lòng ghi rõ lý do mở lại sổ (ít nhất 5 ký tự).';
  end if;
  v_start := make_date(p_year, p_month, 1);

  delete from public.month_closures where month_start = v_start;
  if not found then
    raise exception 'Trung tâm: Tháng %/% chưa được chốt sổ.', p_month, p_year;
  end if;

  perform public._write_audit_log(
    'month_reopen', 'month_closures', null, null, null,
    format('Mở lại sổ tháng %s/%s. Lý do: %s', p_month, p_year, v_reason),
    jsonb_build_object('month_start', v_start),
    jsonb_build_object('month_start', v_start, 'reason', v_reason)
  );
end;
$$;
