-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 06: RPC QUẢN TRỊ (GIÁO VIÊN, TÀI KHOẢN, KHÓA SỔ THÁNG, NHÓM LỚP)
-- Chạy sau 05_rpc_core.sql. Chạy lại an toàn. Mọi hàm ở đây chỉ Quản lý gọi được,
-- trừ class_groups_overview (Giáo viên xem được nhóm mà mọi lớp đều do mình dạy).
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

-- ---------------------------------------------------------------------
-- 4. Nhóm lớp (bảng class_groups, class_group_members ở 01_tables.sql)
--    * Mỗi nhóm có 1..10 phần; mỗi phần gồm các lớp dạy cùng nội dung bài học.
--    * Chặn cứng: học sinh không học hai lớp cùng phần (trigger trg_enrollments_group_check, 04).
--    * Cảnh báo (không chặn): học sinh đã học một phần nhưng chưa học phần khác (class_groups_overview).
-- ---------------------------------------------------------------------

-- "Phần 1: A, B; Phần 2: C, D" (dùng cho nhật ký)
create or replace function public._class_group_label(p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(format('Phần %s: %s', x.part_no, x.names), '; ' order by x.part_no)
  from (
    select m.part_no, string_agg(c.name, ', ' order by c.name) as names
    from public.class_group_members m
    join public.classes c on c.id = m.class_id
    where m.group_id = p_group_id
    group by m.part_no
  ) x;
$$;

-- Thêm/sửa nhóm. p_parts: [[class_id, ...], [class_id, ...]] theo thứ tự phần 1, 2, ...
-- Không lưu nếu đang có học sinh học hai lớp cùng một phần. Trả về id nhóm.
create or replace function public.save_class_group(
  p_group_id uuid,
  p_name     text,
  p_parts    jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_part     jsonb;
  v_no       integer;
  v_item     jsonb;
  v_cls      uuid;
  v_all      uuid[] := '{}';
  v_rows     jsonb := '[]'::jsonb;
  v_bad      text;
  v_old_name text;
  v_old      text;
  v_id       uuid;
begin
  perform public.assert_manager();

  if v_name = '' then
    raise exception 'Trung tâm: Vui lòng nhập tên nhóm lớp.';
  end if;
  if p_group_id is not null then
    select g.name into v_old_name from public.class_groups g where g.id = p_group_id for update;
    if not found then
      raise exception 'Trung tâm: Không tìm thấy nhóm lớp này (có thể đã bị xóa). Hãy tải lại trang.';
    end if;
  end if;
  if exists (select 1 from public.class_groups g where lower(g.name) = lower(v_name) and g.id is distinct from p_group_id) then
    raise exception 'Trung tâm: Đã có nhóm lớp tên "%". Hãy đặt tên khác.', v_name;
  end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'Trung tâm: Vui lòng xếp lớp vào ít nhất một phần.';
  end if;
  if jsonb_array_length(p_parts) > 10 then
    raise exception 'Trung tâm: Mỗi nhóm lớp có tối đa 10 phần.';
  end if;

  for v_part, v_no in select value, ordinality from jsonb_array_elements(p_parts) with ordinality loop
    if jsonb_typeof(v_part) <> 'array' or jsonb_array_length(v_part) = 0 then
      raise exception 'Trung tâm: Phần % chưa có lớp nào. Hãy chọn lớp cho phần này hoặc bớt phần.', v_no;
    end if;
    for v_item in select value from jsonb_array_elements(v_part) loop
      begin
        v_cls := (v_item #>> '{}')::uuid;
      exception when others then
        raise exception 'Trung tâm: Danh sách lớp của nhóm không hợp lệ. Hãy tải lại trang rồi thử lại.';
      end;
      if v_cls is null or v_cls = any (v_all) then
        raise exception 'Trung tâm: Mỗi lớp chỉ được xếp vào một phần của nhóm.';
      end if;
      v_all := v_all || v_cls;
      v_rows := v_rows || jsonb_build_object('class_id', v_cls, 'part_no', v_no);
    end loop;
  end loop;

  if cardinality(v_all) < 2 then
    raise exception 'Trung tâm: Nhóm lớp cần ít nhất hai lớp.';
  end if;

  -- Khóa các lớp: ghi danh đồng thời vào các lớp này phải chờ nhóm lưu xong (và ngược lại).
  perform 1 from public.classes c where c.id = any (v_all) order by c.id for update;
  if (select count(*) from public.classes c where c.id = any (v_all)) <> cardinality(v_all) then
    raise exception 'Trung tâm: Không tìm thấy một số lớp đã chọn. Hãy tải lại trang rồi thử lại.';
  end if;

  select string_agg(c.name, ', ' order by c.name) into v_bad
  from public.classes c
  where c.id = any (v_all) and c.deleted_at is not null
    and not exists (select 1 from public.class_group_members m where m.class_id = c.id and m.group_id = p_group_id);
  if v_bad is not null then
    raise exception 'Trung tâm: Lớp % đang bị ẩn. Hãy khôi phục lớp trước khi thêm vào nhóm.', v_bad;
  end if;

  select string_agg(format('%s (nhóm "%s")', c.name, g.name), ', ' order by c.name) into v_bad
  from public.class_group_members m
  join public.classes c on c.id = m.class_id
  join public.class_groups g on g.id = m.group_id
  where m.class_id = any (v_all) and m.group_id is distinct from p_group_id;
  if v_bad is not null then
    raise exception 'Trung tâm: Mỗi lớp chỉ thuộc một nhóm. Các lớp sau đã thuộc nhóm khác: %.', v_bad;
  end if;

  select string_agg(t.txt, '; ' order by t.full_name) into v_bad
  from (
    select s.full_name, format('%s (%s) đang học cả %s', s.full_name, s.student_code,
                               string_agg(c.name, ' và ' order by c.name)) as txt
    from jsonb_to_recordset(v_rows) as r(class_id uuid, part_no integer)
    join public.class_enrollments e on e.class_id = r.class_id and e.status = 'active'
    join public.classes c on c.id = r.class_id
    join public.students s on s.id = e.student_id
    group by r.part_no, s.id, s.full_name, s.student_code
    having count(*) > 1
    order by s.full_name
    limit 10
  ) t;
  if v_bad is not null then
    raise exception 'Trung tâm: Chưa lưu được nhóm vì có học sinh đang học hai lớp cùng một phần: %. Hãy cho em nghỉ một lớp hoặc đổi lớp trước.', v_bad;
  end if;

  if p_group_id is null then
    insert into public.class_groups (name) values (v_name) returning id into v_id;
  else
    v_id := p_group_id;
    v_old := public._class_group_label(v_id);
    update public.class_groups set name = v_name where id = v_id and name is distinct from v_name;
    delete from public.class_group_members where group_id = v_id;
  end if;

  insert into public.class_group_members (class_id, group_id, part_no)
  select r.class_id, v_id, r.part_no
  from jsonb_to_recordset(v_rows) as r(class_id uuid, part_no integer);

  perform public._write_audit_log(
    'class_group_save', 'class_groups', v_id, null, null,
    format('%s nhóm lớp "%s": %s', case when p_group_id is null then 'Tạo' else 'Sửa' end,
           v_name, public._class_group_label(v_id)),
    case when p_group_id is not null then jsonb_build_object('group_name', v_old_name, 'parts', v_old) end,
    jsonb_build_object('group_name', v_name, 'parts', public._class_group_label(v_id))
  );

  return v_id;
end;
$$;

-- Xóa nhóm (chỉ là cấu hình; lớp, học sinh, ghi danh không đổi).
create or replace function public.delete_class_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_label text;
begin
  perform public.assert_manager();
  select g.name into v_name from public.class_groups g where g.id = p_group_id for update;
  if not found then
    raise exception 'Trung tâm: Không tìm thấy nhóm lớp này (có thể đã bị xóa). Hãy tải lại trang.';
  end if;
  v_label := public._class_group_label(p_group_id);

  delete from public.class_group_members where group_id = p_group_id;
  delete from public.class_groups where id = p_group_id;

  perform public._write_audit_log(
    'class_group_delete', 'class_groups', p_group_id, null, null,
    format('Xóa nhóm lớp "%s" (%s). Lớp và học sinh không thay đổi.', v_name, coalesce(v_label, 'chưa có lớp')),
    jsonb_build_object('group_name', v_name, 'parts', v_label), null
  );
end;
$$;

-- Tình trạng các nhóm lớp cho giao diện (cấu hình + cảnh báo). Quản lý: mọi nhóm; Giáo viên: nhóm mà mọi lớp
-- đều do mình dạy (không lộ học sinh lớp khác). Chỉ tính ghi danh đang học.
-- Trả về [{id, name, parts[{part_no, student_count, classes[{id, name, subject, grade, class_no, hidden,
--   student_count}]}], incomplete[{student_id, student_code, full_name, class_ids[], missing_parts[]}],
--   overlaps[{student_id, student_code, full_name, part_no, class_ids[]}]}]
--   incomplete: học sinh đã học ít nhất một phần nhưng thiếu phần khác (chỉ xét phần còn lớp đang hiển thị).
--   overlaps: học sinh học hai lớp cùng phần (chỉ có ở dữ liệu cũ; ghi danh mới đã bị chặn).
create or replace function public.class_groups_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role   text := public.assert_staff();
  v_me     uuid := public.current_teacher_id();
  v_result jsonb;
begin
  with grp as (
    select g.id, g.name
    from public.class_groups g
    where v_role = 'manager'
       or not exists (
         select 1 from public.class_group_members m
         join public.classes c on c.id = m.class_id
         where m.group_id = g.id and c.teacher_id is distinct from v_me)
  ),
  mem as (
    select m.group_id, m.part_no, c.id as class_id, c.name, c.subject, c.grade, c.class_no,
           c.deleted_at is not null as hidden
    from public.class_group_members m
    join public.classes c on c.id = m.class_id
    where m.group_id in (select id from grp)
  ),
  act as (
    select mb.group_id, mb.part_no, mb.class_id, e.student_id
    from mem mb
    join public.class_enrollments e on e.class_id = mb.class_id and e.status = 'active'
  ),
  open_parts as (
    select distinct group_id, part_no from mem where not hidden
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'name', g.name,
           'parts', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'part_no', p.part_no,
                      'student_count', (select count(distinct a.student_id) from act a
                                        where a.group_id = g.id and a.part_no = p.part_no),
                      'classes', (select jsonb_agg(jsonb_build_object(
                                           'id', mb.class_id, 'name', mb.name, 'subject', mb.subject,
                                           'grade', mb.grade, 'class_no', mb.class_no, 'hidden', mb.hidden,
                                           'student_count', (select count(*) from act a where a.class_id = mb.class_id))
                                         order by mb.name)
                                  from mem mb where mb.group_id = g.id and mb.part_no = p.part_no)
                    ) order by p.part_no), '[]'::jsonb)
             from (select distinct part_no from mem where group_id = g.id) p
           ),
           'incomplete', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name,
                      'class_ids', x.class_ids, 'missing_parts', x.missing_parts
                    ) order by s.full_name, s.student_code), '[]'::jsonb)
             from (
               select st.student_id,
                      (select jsonb_agg(a2.class_id order by a2.part_no) from act a2
                       where a2.group_id = g.id and a2.student_id = st.student_id) as class_ids,
                      (select jsonb_agg(op.part_no order by op.part_no) from open_parts op
                       where op.group_id = g.id
                         and not exists (select 1 from act a3 where a3.group_id = g.id
                                           and a3.part_no = op.part_no and a3.student_id = st.student_id)) as missing_parts
               from (select distinct student_id from act where group_id = g.id) st
             ) x
             join public.students s on s.id = x.student_id
             where x.missing_parts is not null
           ),
           'overlaps', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name,
                      'part_no', o.part_no, 'class_ids', o.class_ids
                    ) order by s.full_name, o.part_no), '[]'::jsonb)
             from (
               select a.student_id, a.part_no, jsonb_agg(a.class_id) as class_ids
               from act a where a.group_id = g.id
               group by a.student_id, a.part_no
               having count(*) > 1
             ) o
             join public.students s on s.id = o.student_id
           )
         ) order by g.name), '[]'::jsonb)
    into v_result
  from grp g;

  return v_result;
end;
$$;
