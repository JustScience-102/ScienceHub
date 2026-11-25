-- =====================================================================
-- Lớp học ScienceHub V3 - FILE 11: TRANG GIỚI THIỆU sciencehub.id.vn (thư mục site/)
-- Thứ tự chạy trong SQL Editor: website_link.sql (một lần, tạo tài khoản) -> file này -> 09_grants.sql.
-- Chạy lại an toàn.
--
-- Trang giới thiệu (dự án Vercel riêng) nối vào Database này bằng tài khoản CSDL "website_link" qua hàm máy chủ
-- (site/api/*), giống cách app giao bài dùng "sciencehub_link" (10_sciencehub.sql). Mọi thứ nằm trong schema riêng
-- "website" (PostgREST không mở); anon và authenticated không vào được; website_link không đọc được bảng nào của
-- schema public, chỉ gọi các hàm dưới đây.
--   * website.catalog(p_subjects): lớp đang hiển thị để phụ huynh xem lịch (môn, khối, STT, tên giáo viên, nhóm lớp
--     và phần, lịch đang áp dụng và lịch sắp áp dụng). KHÔNG trả đơn giá (học phí trên web theo quy định của
--     Trung tâm Chìa Khóa Vàng, site/src/data/fees.js), học sinh, phụ huynh, điểm danh, doanh thu.
--   * website.submit_registration(p_data, p_ip_hash): nhận đơn đăng ký học từ form của web (mốc M3), kiểm tra lại
--     toàn bộ (lịch theo nhóm lớp: mỗi phần đúng một ca; đúng khối; không trùng giờ; mã HS giới thiệu có thật;
--     chống gửi trùng, chống spam) rồi ghi vào website.registration_requests.
-- Đơn đăng ký chỉ Quản lý xem trong app (RPC public.list_registration_requests, set_registration_status,
-- registration_requests_summary). Bảng đơn KHÔNG nằm trong file sao lưu .json (người dùng chốt 24/11/2026): đơn là
-- dữ liệu tạm để liên hệ phụ huynh; em vào học thì thông tin nằm trong bảng học sinh như mọi em khác.
-- Câu báo lỗi của website.* là câu cho phụ huynh đọc (không có tiền tố "Trung tâm:"); RPC của app giữ tiền tố.
-- =====================================================================

create schema if not exists website;
revoke all on schema website from public;

-- p_subjects: các môn cần lấy (so không phân biệt hoa thường); NULL = mọi môn.
-- schedules: mọi dòng lịch còn hiệu lực từ hôm nay (lịch hiện hành và lịch sắp áp dụng), kèm from/to để trang web
-- tách "lịch đang áp dụng" và "lịch mới từ ngày ..." theo đúng quy tắc thời kỳ (ARCHITECTURE.md mục 2.4).
create or replace function website.catalog(p_subjects text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'today', public.vn_today(),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'subject', c.subject,
          'grade', c.grade,
          'class_no', c.class_no,
          'teacher', t.full_name,
          'group', case when m.group_id is null then null
                        else jsonb_build_object('id', m.group_id, 'name', g.name, 'part', m.part_no) end,
          'schedules', coalesce((
            select jsonb_agg(jsonb_build_object(
                'day', s.day_of_week,
                'start', to_char(s.start_time, 'HH24:MI'),
                'end', to_char(s.end_time, 'HH24:MI'),
                'from', s.valid_from,
                'to', s.valid_to)
              order by s.valid_from nulls first, s.day_of_week, s.start_time)
            from public.class_schedules s
            where s.class_id = c.id
              and (s.valid_to is null or s.valid_to >= public.vn_today())), '[]'::jsonb))
        order by c.subject, c.grade, c.class_no)
      from public.classes c
      left join public.teachers t on t.id = c.teacher_id
      left join public.class_group_members m on m.class_id = c.id
      left join public.class_groups g on g.id = m.group_id
      where c.deleted_at is null
        and (p_subjects is null or lower(c.subject) in (select lower(x) from unnest(p_subjects) as x))), '[]'::jsonb)
  );
$$;
revoke all on function website.catalog(text[]) from public;

-- ---------------------------------------------------------------------
-- Đơn đăng ký học (form trang Đăng ký học). choices: ảnh chụp lựa chọn lúc gửi (môn, khối, nhóm, phần, giáo viên,
-- lịch) để đơn vẫn đọc được khi lớp đổi sau này; class_ids để app quản lý mở đúng lớp khi xếp lớp.
-- ---------------------------------------------------------------------
create table if not exists website.registration_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  status         text not null default 'new' check (status in ('new', 'contacted', 'enrolled', 'cancelled')),
  student_name   text not null,
  grade          smallint not null check (grade between 1 and 12),
  school         text,
  student_phone  text,
  parent_name    text not null,
  parent_phone   text not null,
  referrer_code  text,                       -- mã HS giới thiệu (HS0123), đã kiểm tra có trong bảng học sinh lúc gửi
  note           text,
  class_ids      uuid[] not null,
  choices        jsonb not null,
  ip_hash        text,                       -- HMAC địa chỉ IP (do hàm máy chủ tính), chỉ để chống spam
  staff_note     text,                       -- ghi chú của Quản lý
  handled_at     timestamptz,
  handled_by     uuid
);
create index if not exists idx_registration_requests_created on website.registration_requests (created_at desc);
create index if not exists idx_registration_requests_phone on website.registration_requests (parent_phone, created_at desc);
create index if not exists idx_registration_requests_ip on website.registration_requests (ip_hash, created_at desc);
alter table website.registration_requests enable row level security;
revoke all on website.registration_requests from public;

-- SĐT: bỏ dấu cách, chấm, gạch, ngoặc; +84/84 đầu số -> 0. Trả NULL khi không đúng 10 số bắt đầu bằng 0.
create or replace function website._phone(p_raw text)
returns text
language sql
immutable
as $$
  select case when v ~ '^0\d{9}$' then v end
  from (select regexp_replace(regexp_replace(coalesce(p_raw, ''), '[\s.()\-]', '', 'g'), '^\+?84(\d{9})$', '0\1') as v) x;
$$;
revoke all on function website._phone(text) from public;

-- Nhận một đơn. p_data: JSON (chuỗi) { student_name, grade, school, student_phone, parent_name, parent_phone,
-- referrer_code, note, class_ids: [uuid, ...] }. Lỗi nhập liệu: RAISE (SQLSTATE P0001) bằng câu cho phụ huynh đọc,
-- hàm máy chủ chuyển nguyên câu đó lên form. Cùng SĐT phụ huynh + cùng họ tên học sinh (so bằng _norm_name) đã có
-- đơn "Mới" trong 7 ngày thì cập nhật đơn đó (phụ huynh gửi lại để đổi lịch), không tạo đơn thứ hai.
create or replace function website.submit_registration(p_data text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v          jsonb;
  v_today    date := public.vn_today();
  v_student  text;
  v_grade    integer;
  v_school   text;
  v_sphone   text;
  v_parent   text;
  v_pphone   text;
  v_ref      text;
  v_note     text;
  v_ids      uuid[];
  v_subject  text;
  v_count    integer;
  v_single   integer;
  v_groups   integer;
  v_group    uuid;
  v_part     smallint;
  v_choices  jsonb;
  v_existing uuid;
begin
  begin
    v := p_data::jsonb;
  exception when others then
    raise exception 'Dữ liệu đăng ký không đọc được. Phụ huynh vui lòng tải lại trang rồi gửi lại.';
  end;
  if jsonb_typeof(v) is distinct from 'object' then
    raise exception 'Dữ liệu đăng ký không đọc được. Phụ huynh vui lòng tải lại trang rồi gửi lại.';
  end if;

  v_student := regexp_replace(btrim(coalesce(v->>'student_name', '')), '\s+', ' ', 'g');
  v_parent  := regexp_replace(btrim(coalesce(v->>'parent_name', '')), '\s+', ' ', 'g');
  v_school  := nullif(regexp_replace(btrim(coalesce(v->>'school', '')), '\s+', ' ', 'g'), '');
  v_note    := nullif(btrim(coalesce(v->>'note', '')), '');
  v_ref     := nullif(upper(regexp_replace(coalesce(v->>'referrer_code', ''), '\s', '', 'g')), '');
  v_grade   := case when coalesce(v->>'grade', '') ~ '^\d{1,2}$' then (v->>'grade')::integer end;

  if char_length(v_student) < 2 or char_length(v_student) > 100 then
    raise exception 'Vui lòng nhập họ tên của con (2 đến 100 ký tự).';
  end if;
  if v_grade is null or v_grade not between 1 and 12 then
    raise exception 'Vui lòng chọn khối lớp của con.';
  end if;
  if char_length(v_parent) < 2 or char_length(v_parent) > 100 then
    raise exception 'Vui lòng nhập họ tên phụ huynh (2 đến 100 ký tự).';
  end if;
  v_pphone := website._phone(v->>'parent_phone');
  if v_pphone is null then
    raise exception 'Số điện thoại phụ huynh cần đủ 10 chữ số, bắt đầu bằng 0 (ví dụ 0912345678).';
  end if;
  if nullif(btrim(coalesce(v->>'student_phone', '')), '') is not null then
    v_sphone := website._phone(v->>'student_phone');
    if v_sphone is null then
      raise exception 'Số điện thoại của con cần đủ 10 chữ số, bắt đầu bằng 0; không có thì để trống.';
    end if;
  end if;
  if char_length(coalesce(v_school, '')) > 150 then
    raise exception 'Tên trường tối đa 150 ký tự.';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'Ghi chú tối đa 1000 ký tự.';
  end if;
  if v_ref is not null then
    if v_ref !~ '^HS\d{4,6}$' then
      raise exception 'Mã học sinh giới thiệu có dạng HS và 4 chữ số, ví dụ HS0123; không có thì để trống.';
    end if;
    if not exists (select 1 from public.students s where s.student_code = v_ref) then
      raise exception 'Không tìm thấy mã học sinh giới thiệu %. Phụ huynh kiểm tra lại mã hoặc để trống ô này.', v_ref;
    end if;
  end if;

  -- Lớp đã chọn
  begin
    select coalesce(array_agg(distinct x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(case when jsonb_typeof(v->'class_ids') = 'array' then v->'class_ids' else '[]' end) x;
  exception when others then
    raise exception 'Lịch học đã chọn không hợp lệ. Phụ huynh vui lòng tải lại trang và chọn lại.';
  end;
  if cardinality(v_ids) = 0 then
    raise exception 'Vui lòng chọn lịch học cho ít nhất một môn.';
  end if;
  if cardinality(v_ids) > 12 then
    raise exception 'Lịch học đã chọn không hợp lệ. Phụ huynh vui lòng tải lại trang và chọn lại.';
  end if;
  if (select count(*) from public.classes c where c.id = any (v_ids) and c.deleted_at is null) <> cardinality(v_ids) then
    raise exception 'Có lịch học đã chọn không còn mở. Phụ huynh vui lòng tải lại trang và chọn lại.';
  end if;
  if exists (select 1 from public.classes c where c.id = any (v_ids) and c.grade <> v_grade) then
    raise exception 'Lịch học đã chọn không đúng khối % của con. Phụ huynh vui lòng chọn lại.', v_grade;
  end if;

  -- Mỗi môn: một lớp lẻ, HOẶC đúng một ca ở mỗi phần đang mở của một nhóm lớp (ARCHITECTURE.md mục 2.7, 5.2).
  for v_subject in select distinct c.subject from public.classes c where c.id = any (v_ids) order by 1 loop
    select count(*), count(*) filter (where m.group_id is null), count(distinct m.group_id), min(m.group_id::text)::uuid
      into v_count, v_single, v_groups, v_group
    from public.classes c
    left join public.class_group_members m on m.class_id = c.id
    where c.id = any (v_ids) and c.subject = v_subject;

    if v_single > 0 then
      if v_count > 1 then
        raise exception 'Môn %: chỉ chọn một lịch học. Phụ huynh vui lòng chọn lại.', v_subject;
      end if;
      continue;
    end if;
    if v_groups > 1 then
      raise exception 'Môn %: chỉ chọn một lịch học. Phụ huynh vui lòng chọn lại.', v_subject;
    end if;
    select m.part_no into v_part
    from public.class_group_members m
    where m.class_id = any (v_ids) and m.group_id = v_group
    group by m.part_no having count(*) > 1
    order by m.part_no limit 1;
    if v_part is not null then
      raise exception 'Môn %: không chọn 2 ca của cùng Phần % vì hai ca đó học cùng nội dung. Mỗi phần chỉ chọn 1 ca.', v_subject, v_part;
    end if;
    select min(m.part_no) into v_part
    from public.class_group_members m
    join public.classes c on c.id = m.class_id and c.deleted_at is null
    where m.group_id = v_group
      and m.part_no not in (select m2.part_no from public.class_group_members m2
                            where m2.class_id = any (v_ids) and m2.group_id = v_group);
    if v_part is not null then
      raise exception 'Môn %: còn thiếu ca của Phần %. Mỗi tuần con học 1 ca ở mỗi phần.', v_subject, v_part;
    end if;
  end loop;

  -- Hai buổi trùng giờ (theo lịch đang áp dụng hôm nay)
  if exists (
    select 1
    from public.class_schedules a
    join public.class_schedules b
      on a.class_id < b.class_id and a.day_of_week = b.day_of_week
     and a.start_time < b.end_time and b.start_time < a.end_time
    where a.class_id = any (v_ids) and b.class_id = any (v_ids)
      and (a.valid_from is null or a.valid_from <= v_today) and (a.valid_to is null or a.valid_to >= v_today)
      and (b.valid_from is null or b.valid_from <= v_today) and (b.valid_to is null or b.valid_to >= v_today)
  ) then
    raise exception 'Có hai ca đã chọn bị trùng giờ. Phụ huynh vui lòng chọn lại lịch khác.';
  end if;

  select jsonb_agg(jsonb_build_object(
      'class_id', c.id, 'subject', c.subject, 'grade', c.grade, 'class_no', c.class_no,
      'teacher', t.full_name, 'part', m.part_no,
      'schedule', coalesce((
        select jsonb_agg(jsonb_build_object('day', s.day_of_week, 'start', to_char(s.start_time, 'HH24:MI'),
                                            'end', to_char(s.end_time, 'HH24:MI')) order by s.day_of_week, s.start_time)
        from public.class_schedules s
        where s.class_id = c.id
          and (s.valid_from is null or s.valid_from <= v_today) and (s.valid_to is null or s.valid_to >= v_today)), '[]'::jsonb))
    order by c.subject, m.part_no nulls first, c.class_no)
    into v_choices
  from public.classes c
  left join public.teachers t on t.id = c.teacher_id
  left join public.class_group_members m on m.class_id = c.id
  where c.id = any (v_ids);

  -- Gửi lại (đổi lịch) trong 7 ngày: cập nhật đơn "Mới" đã có.
  select r.id into v_existing
  from website.registration_requests r
  where r.status = 'new' and r.parent_phone = v_pphone
    and public._norm_name(r.student_name) = public._norm_name(v_student)
    and r.created_at > now() - interval '7 days'
  order by r.created_at desc limit 1;

  if v_existing is not null then
    update website.registration_requests
       set updated_at = now(), student_name = v_student, grade = v_grade, school = v_school,
           student_phone = v_sphone, parent_name = v_parent, referrer_code = v_ref, note = v_note,
           class_ids = v_ids, choices = v_choices
     where id = v_existing;
    return jsonb_build_object('id', v_existing, 'updated', true);
  end if;

  -- Chống spam: tối đa 10 đơn mới / giờ / địa chỉ IP và 5 đơn mới / ngày / SĐT phụ huynh.
  if (p_ip_hash is not null and (select count(*) from website.registration_requests r
        where r.ip_hash = p_ip_hash and r.created_at > now() - interval '1 hour') >= 10)
     or (select count(*) from website.registration_requests r
        where r.parent_phone = v_pphone and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Phụ huynh đã gửi nhiều đơn trong thời gian ngắn. Vui lòng thử lại sau hoặc gọi điện cho thầy.';
  end if;

  insert into website.registration_requests
    (student_name, grade, school, student_phone, parent_name, parent_phone, referrer_code, note, class_ids, choices, ip_hash)
  values
    (v_student, v_grade, v_school, v_sphone, v_parent, v_pphone, v_ref, v_note, v_ids, v_choices, p_ip_hash)
  returning id into v_existing;
  return jsonb_build_object('id', v_existing, 'updated', false);
end;
$$;
revoke all on function website.submit_registration(text, text) from public;

-- ---------------------------------------------------------------------
-- RPC cho app quản lý (chỉ Quản lý). Đơn mới nhất trước; kèm thông tin để liên hệ và xếp lớp:
--   referrer: học sinh giới thiệu (mã, họ tên, còn học không); parent_match: SĐT phụ huynh đã có trong app.
-- ---------------------------------------------------------------------
create or replace function public.list_registration_requests(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();
  if p_status is not null and p_status not in ('new', 'contacted', 'enrolled', 'cancelled') then
    raise exception 'Trung tâm: Trạng thái đơn không hợp lệ.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'updated_at', r.updated_at, 'status', r.status,
        'student_name', r.student_name, 'grade', r.grade, 'school', r.school, 'student_phone', r.student_phone,
        'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'note', r.note, 'staff_note', r.staff_note,
        'handled_at', r.handled_at, 'class_ids', to_jsonb(r.class_ids), 'choices', r.choices,
        'referrer_code', r.referrer_code,
        'referrer', (select jsonb_build_object('code', s.student_code, 'name', s.full_name, 'active', s.deleted_at is null)
                     from public.students s where s.student_code = r.referrer_code),
        'parent_match', (select jsonb_build_object(
                            'parent_code', p.parent_code, 'full_name', p.full_name,
                            'children', coalesce((select jsonb_agg(jsonb_build_object(
                                'student_code', s.student_code, 'full_name', s.full_name, 'active', s.deleted_at is null)
                                order by s.student_code)
                              from public.students s where s.parent_id = p.id), '[]'::jsonb))
                         from public.parents p where p.phone = r.parent_phone))
      order by r.created_at desc)
    from (select * from website.registration_requests
          where p_status is null or status = p_status
          order by created_at desc limit 500) r), '[]'::jsonb);
end;
$$;

-- Đổi trạng thái đơn và ghi chú. p_staff_note NULL: giữ ghi chú cũ; chuỗi rỗng: xóa ghi chú.
create or replace function public.set_registration_status(p_id uuid, p_status text, p_staff_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row website.registration_requests;
begin
  perform public.assert_manager();
  if p_status not in ('new', 'contacted', 'enrolled', 'cancelled') then
    raise exception 'Trung tâm: Trạng thái đơn không hợp lệ.';
  end if;
  update website.registration_requests
     set status = p_status,
         staff_note = case when p_staff_note is null then staff_note else nullif(btrim(p_staff_note), '') end,
         handled_at = now(), handled_by = auth.uid(), updated_at = now()
   where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Trung tâm không tìm thấy đơn đăng ký này.';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'staff_note', v_row.staff_note, 'handled_at', v_row.handled_at);
end;
$$;

-- Số đơn theo trạng thái (số trên menu "Đơn đăng ký").
create or replace function public.registration_requests_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();
  return jsonb_build_object(
    'new', (select count(*) from website.registration_requests where status = 'new'),
    'contacted', (select count(*) from website.registration_requests where status = 'contacted'));
end;
$$;

-- 09_grants.sql cũng cấp quyền 3 RPC này (hàm public không bắt đầu bằng "_"); ghi ở đây để chạy file này sau 09 vẫn
-- dùng được ngay. Chỉ Quản lý gọi được (assert_manager), Giáo viên gọi thì báo lỗi.
revoke all on function public.list_registration_requests(text) from public, anon;
revoke all on function public.set_registration_status(uuid, text, text) from public, anon;
revoke all on function public.registration_requests_summary() from public, anon;
grant execute on function public.list_registration_requests(text) to authenticated;
grant execute on function public.set_registration_status(uuid, text, text) to authenticated;
grant execute on function public.registration_requests_summary() to authenticated;

-- Tài khoản kết nối đã có (đã chạy website_link.sql) thì cấp quyền; chạy lại file này vẫn giữ đủ quyền.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'website_link') then
    grant usage on schema website to website_link;
    grant execute on function website.catalog(text[]) to website_link;
    grant execute on function website.submit_registration(text, text) to website_link;
  end if;
end $$;

insert into public.schema_migrations (version, note)
values ('V3.2', 'Trang giới thiệu sciencehub.id.vn: schema website, website.catalog() (11_website.sql)')
on conflict (version) do nothing;
insert into public.schema_migrations (version, note)
values ('V3.3', 'Trang giới thiệu: đơn đăng ký học (website.registration_requests, submit_registration, RPC Đơn đăng ký)')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
