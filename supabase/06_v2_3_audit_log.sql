-- =====================================================================
-- Trung tâm ScienceHub - FILE 06: V2-3 NHẬT KÝ THAY ĐỔI (AUDIT LOG)
-- Chạy SAU 05_v2_2_teacher_access.sql. An toàn khi chạy lại nhiều lần.
-- KHÔNG chạy lại 03_rpc_and_auth.sql.
--
-- Nội dung:
--   1. Bảng public.audit_log + chỉ mục + RLS (chỉ Quản lý đọc) + chặn sửa/xóa/truncate.
--   2. Hàm nội bộ _write_audit_log (lấy người thao tác từ auth.uid()).
--   3. Trigger tự động ghi nhật ký trên các bảng nghiệp vụ:
--      - attendance_records   : điểm danh, sửa, xóa, học bù (giữ nguyên price_snapshot đóng băng)
--      - class_enrollments    : ghi danh, cho nghỉ, đổi lớp
--      - classes, class_schedules : tạo, sửa, ẩn, khôi phục lớp; đổi lịch học
--      - students, parents    : tạo, sửa, tự ẩn / tự hiện học sinh; sửa phụ huynh
--      - teachers, profiles   : thêm, sửa, ẩn, khôi phục giáo viên; liên kết, gỡ, khóa, mở khóa tài khoản
--   4. RPC chỉ Quản lý: vn_school_year_bounds, query_audit_logs, clear_audit_logs_before.
--
-- Nhật ký ghi theo từng dòng dữ liệu. Cột batch_id (mã giao dịch) giúp giao diện gộp
-- các dòng cùng một lần bấm (ví dụ "Tất cả có mặt") thành một nhóm.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Khoảng Năm học của Trung tâm: 15/06/YYYY -> 12/06/(YYYY+1)
-- ---------------------------------------------------------------------
create or replace function public.vn_school_year_bounds(p_start_year integer default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_today      date := public.vn_today();
  v_year       integer := extract(year from public.vn_today())::integer;
  v_start_year integer;
begin
  if p_start_year is not null then
    v_start_year := p_start_year;
  elsif v_today >= make_date(v_year, 6, 15) then
    v_start_year := v_year;
  else
    v_start_year := v_year - 1;
  end if;

  return jsonb_build_object(
    'school_year', v_start_year::text || '-' || (v_start_year + 1)::text,
    'start_year',  v_start_year,
    'end_year',    v_start_year + 1,
    'start_date',  make_date(v_start_year, 6, 15),
    'end_date',    make_date(v_start_year + 1, 6, 12)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Bảng audit_log
--    Các cột uuid liên kết KHÔNG đặt khóa ngoại để không cản trở thao tác
--    xóa điểm danh hoặc thay thế tài khoản giáo viên.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default clock_timestamp(),
  batch_id         bigint not null default txid_current(),
  actor_user_id    uuid,
  actor_role       text not null default 'system'
                   check (actor_role in ('manager', 'teacher', 'system')),
  actor_teacher_id uuid,
  actor_name       text not null default 'Hệ thống',
  action           text not null,
  table_name       text not null,
  record_id        uuid,
  class_id         uuid,
  student_id       uuid,
  summary          text not null,
  old_data         jsonb,
  new_data         jsonb
);

create index if not exists idx_audit_log_created_at
  on public.audit_log (created_at desc, id desc);
create index if not exists idx_audit_log_action
  on public.audit_log (action);
create index if not exists idx_audit_log_class_id
  on public.audit_log (class_id) where class_id is not null;
create index if not exists idx_audit_log_student_id
  on public.audit_log (student_id) where student_id is not null;
create index if not exists idx_audit_log_actor_teacher
  on public.audit_log (actor_teacher_id) where actor_teacher_id is not null;

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon, public;
revoke insert, update, delete, truncate on table public.audit_log from authenticated;
grant select on table public.audit_log to authenticated;

drop policy if exists v2_manager_select_audit_log on public.audit_log;
create policy v2_manager_select_audit_log on public.audit_log
  for select to authenticated
  using ((select public.is_manager()));

-- Chặn tuyệt đối UPDATE / DELETE / TRUNCATE trực tiếp.
-- Ngoại lệ duy nhất: DELETE trong giao dịch của hàm clear_audit_logs_before (cờ cục bộ giao dịch).
create or replace function public._guard_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('sciencehub.allow_audit_clear', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Trung tâm: Nhật ký thay đổi được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa trực tiếp.';
end;
$$;

revoke execute on function public._guard_audit_log_immutable() from anon, authenticated, public;

drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public._guard_audit_log_immutable();

create or replace function public._guard_audit_log_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Trung tâm: Nhật ký thay đổi được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa trực tiếp.';
end;
$$;

revoke execute on function public._guard_audit_log_truncate() from anon, authenticated, public;

drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public._guard_audit_log_truncate();

-- ---------------------------------------------------------------------
-- 3. Hàm nội bộ
-- ---------------------------------------------------------------------

-- 3.1 Ghi một dòng nhật ký (người thao tác lấy từ auth.uid())
create or replace function public._write_audit_log(
  p_action     text,
  p_table_name text,
  p_record_id  uuid,
  p_class_id   uuid,
  p_student_id uuid,
  p_summary    text,
  p_old_data   jsonb,
  p_new_data   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_role       text;
  v_teacher_id uuid;
  v_actor_name text;
  v_email      text;
  v_tname      text;
begin
  if v_uid is not null then
    select p.role, p.teacher_id
      into v_role, v_teacher_id
    from public.profiles p
    where p.user_id = v_uid;

    select u.email into v_email
    from auth.users u
    where u.id = v_uid;

    if v_role = 'teacher' and v_teacher_id is not null then
      select t.full_name into v_tname
      from public.teachers t
      where t.id = v_teacher_id;
      v_actor_name := coalesce('GV ' || v_tname, v_email, 'Giáo viên');
    elsif v_role = 'manager' then
      v_teacher_id := null;
      v_actor_name := case
        when v_email is not null then 'Quản lý (' || v_email || ')'
        else 'Quản lý'
      end;
    else
      v_role       := 'system';
      v_teacher_id := null;
      v_actor_name := coalesce(v_email, 'Hệ thống');
    end if;
  else
    v_role       := 'system';
    v_actor_name := 'Hệ thống (SQL)';
  end if;

  insert into public.audit_log (
    actor_user_id, actor_role, actor_teacher_id, actor_name,
    action, table_name, record_id, class_id, student_id,
    summary, old_data, new_data
  ) values (
    v_uid, v_role, v_teacher_id, v_actor_name,
    p_action, p_table_name, p_record_id, p_class_id, p_student_id,
    p_summary, p_old_data, p_new_data
  );
end;
$$;

revoke execute on function public._write_audit_log(text, text, uuid, uuid, uuid, text, jsonb, jsonb)
  from anon, authenticated, public;

-- 3.2 Định dạng tiền VNĐ có dấu chấm: 100000 -> '100.000đ' (không phụ thuộc locale của Database)
create or replace function public._fmt_vnd(p_amount integer)
returns text
language sql
stable
as $$
  select replace(to_char(coalesce(p_amount, 0), 'FM999,999,999,999'), ',', '.') || 'đ';
$$;

revoke execute on function public._fmt_vnd(integer) from anon, authenticated, public;

-- 3.3 Nhãn trạng thái điểm danh bằng tiếng Việt
create or replace function public._attendance_status_label(p_status text, p_price integer)
returns text
language sql
stable
as $$
  select case p_status
    when 'present'        then 'Có mặt (' || public._fmt_vnd(p_price) || ')'
    when 'absent'         then 'Vắng tính phí (' || public._fmt_vnd(p_price) || ')'
    when 'absent_excused' then 'Vắng có phép (0đ)'
    else 'Chưa chấm'
  end;
$$;

revoke execute on function public._attendance_status_label(text, integer)
  from anon, authenticated, public;

-- 3.4 Dữ liệu JSON của một dòng điểm danh (không kèm id, giao diện chỉ hiện nhãn tiếng Việt)
create or replace function public._attendance_payload(
  p_date            date,
  p_status          text,
  p_price           integer,
  p_class_name      text,
  p_orig_class_name text,
  p_student_code    text,
  p_student_name    text,
  p_is_makeup       boolean
) returns jsonb
language sql
stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'attendance_date', p_date,
    'status',          p_status,
    'price_snapshot',  p_price,
    'class_name',      p_class_name,
    'orig_class_name', case when p_is_makeup then p_orig_class_name else null end,
    'student_code',    p_student_code,
    'student_name',    p_student_name,
    'is_makeup',       p_is_makeup
  ));
$$;

revoke execute on function public._attendance_payload(date, text, integer, text, text, text, text, boolean)
  from anon, authenticated, public;

-- 3.5 Chuyển chuỗi lịch '2|17:30|19:00;4|17:30|19:00' thành 'T2 17:30–19:00, T4 17:30–19:00'
create or replace function public._schedule_snap_label(p_snap text)
returns text
language sql
stable
as $$
  select coalesce(
    string_agg(
      case split_part(x, '|', 1) when '8' then 'CN' else 'T' || split_part(x, '|', 1) end
        || ' ' || split_part(x, '|', 2) || '–' || split_part(x, '|', 3),
      ', ' order by split_part(x, '|', 1)::integer
    ),
    'Chưa có lịch'
  )
  from regexp_split_to_table(coalesce(p_snap, ''), ';') as x
  where x <> '';
$$;

revoke execute on function public._schedule_snap_label(text) from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 4. Các Trigger tự động ghi Nhật ký
-- ---------------------------------------------------------------------

-- 4.1 Điểm danh & Học bù (attendance_records)
--     Ghi đúng price_snapshot đã đóng băng, không tính lại theo classes.price_per_session.
create or replace function public._trg_audit_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row          public.attendance_records%rowtype;
  v_enr          public.class_enrollments%rowtype;
  v_class_name   text;
  v_orig_name    text;
  v_student_name text;
  v_student_code text;
  v_is_makeup    boolean := false;
  v_action       text;
  v_summary      text;
  v_old          jsonb := null;
  v_new          jsonb := null;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.price_snapshot is not distinct from new.price_snapshot
     and old.enrollment_id is not distinct from new.enrollment_id then
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select * into v_enr from public.class_enrollments where id = v_row.enrollment_id;
  select c.name into v_class_name from public.classes c where c.id = v_row.class_id;
  select s.full_name, s.student_code
    into v_student_name, v_student_code
  from public.students s
  where s.id = v_row.student_id;

  v_orig_name := v_class_name;
  if v_enr.id is not null and v_enr.class_id <> v_row.class_id then
    v_is_makeup := true;
    select c.name into v_orig_name from public.classes c where c.id = v_enr.class_id;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := public._attendance_payload(
      old.attendance_date, old.status, old.price_snapshot,
      v_class_name, v_orig_name, v_student_code, v_student_name, v_is_makeup
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := public._attendance_payload(
      new.attendance_date, new.status, new.price_snapshot,
      v_class_name, v_orig_name, v_student_code, v_student_name, v_is_makeup
    );
  end if;

  if tg_op = 'INSERT' then
    if v_is_makeup then
      v_action  := 'makeup_record';
      v_summary := format(
        'Ghi nhận học bù cho %s (%s) tại lớp %s ngày %s, bù cho lớp %s (%s)',
        coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
        coalesce(v_class_name, ''), to_char(new.attendance_date, 'DD/MM/YYYY'),
        coalesce(v_orig_name, ''), public._attendance_status_label(new.status, new.price_snapshot)
      );
    else
      v_action  := 'attendance_create';
      v_summary := format(
        'Điểm danh %s (%s) lớp %s ngày %s: %s',
        coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
        coalesce(v_class_name, ''), to_char(new.attendance_date, 'DD/MM/YYYY'),
        public._attendance_status_label(new.status, new.price_snapshot)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    v_action  := 'attendance_update';
    v_summary := format(
      'Đổi điểm danh %s (%s) lớp %s ngày %s: %s -> %s',
      coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
      coalesce(v_class_name, ''), to_char(new.attendance_date, 'DD/MM/YYYY'),
      public._attendance_status_label(old.status, old.price_snapshot),
      public._attendance_status_label(new.status, new.price_snapshot)
    );
  else
    v_action  := 'attendance_delete';
    v_summary := format(
      'Xóa điểm danh%s của %s (%s) tại lớp %s ngày %s (trước đó: %s)',
      case when v_is_makeup then ' học bù' else '' end,
      coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
      coalesce(v_class_name, ''), to_char(old.attendance_date, 'DD/MM/YYYY'),
      public._attendance_status_label(old.status, old.price_snapshot)
    );
  end if;

  perform public._write_audit_log(
    v_action, 'attendance_records', v_row.id, v_row.class_id, v_row.student_id,
    v_summary, v_old, v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public._trg_audit_attendance() from anon, authenticated, public;

drop trigger if exists trg_audit_attendance on public.attendance_records;
create trigger trg_audit_attendance
  after insert or update or delete on public.attendance_records
  for each row execute function public._trg_audit_attendance();

-- 4.2 Ghi danh / Cho nghỉ / Đổi lớp (class_enrollments)
--     Đổi lớp = vào lớp mới (INSERT) rồi nghỉ lớp cũ (UPDATE) trong cùng giao dịch:
--     dòng "Ghi danh" của lớp mới vẫn được ghi, giao diện gộp chung với dòng "Đổi lớp" qua batch_id.
create or replace function public._trg_audit_enrollments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name     text;
  v_student_name   text;
  v_student_code   text;
  v_transfer       public.class_enrollments%rowtype;
  v_new_class_name text;
begin
  select c.name into v_class_name from public.classes c where c.id = new.class_id;
  select s.full_name, s.student_code
    into v_student_name, v_student_code
  from public.students s
  where s.id = new.student_id;

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'enrollment_create', 'class_enrollments', new.id, new.class_id, new.student_id,
      format(
        'Ghi danh %s (%s) vào lớp %s từ ngày %s',
        coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
        coalesce(v_class_name, ''), to_char(new.joined_at, 'DD/MM/YYYY')
      ),
      null,
      jsonb_build_object(
        'class_name',   v_class_name,
        'student_code', v_student_code,
        'student_name', v_student_name,
        'status',       new.status,
        'joined_at',    new.joined_at
      )
    );

  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'dropped' then
    -- Có lớp mới được tạo cùng giao dịch, vào đúng ngày nghỉ => đây là Đổi lớp.
    select * into v_transfer
    from public.class_enrollments e
    where e.student_id = new.student_id
      and e.id <> new.id
      and e.status = 'active'
      and e.joined_at = new.left_at
      and e.created_at = transaction_timestamp()
    order by e.created_at desc
    limit 1;

    if found then
      select c.name into v_new_class_name from public.classes c where c.id = v_transfer.class_id;

      perform public._write_audit_log(
        'enrollment_transfer', 'class_enrollments', new.id, new.class_id, new.student_id,
        format(
          'Đổi lớp cho %s (%s): từ lớp %s sang lớp %s (ngày chuyển %s)',
          coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
          coalesce(v_class_name, ''), coalesce(v_new_class_name, ''),
          to_char(new.left_at, 'DD/MM/YYYY')
        ),
        jsonb_build_object(
          'student_code',    v_student_code,
          'student_name',    v_student_name,
          'from_class_name', v_class_name,
          'joined_at',       old.joined_at,
          'status',          old.status
        ),
        jsonb_build_object(
          'student_code',  v_student_code,
          'student_name',  v_student_name,
          'to_class_name', v_new_class_name,
          'transfer_date', new.left_at,
          'status',        new.status
        )
      );
    else
      perform public._write_audit_log(
        'enrollment_drop', 'class_enrollments', new.id, new.class_id, new.student_id,
        format(
          'Cho %s (%s) nghỉ lớp %s từ ngày %s',
          coalesce(v_student_name, 'Học sinh'), coalesce(v_student_code, ''),
          coalesce(v_class_name, ''), to_char(new.left_at, 'DD/MM/YYYY')
        ),
        jsonb_build_object(
          'class_name',   v_class_name,
          'student_code', v_student_code,
          'student_name', v_student_name,
          'status',       old.status,
          'joined_at',    old.joined_at
        ),
        jsonb_build_object(
          'class_name',   v_class_name,
          'student_code', v_student_code,
          'student_name', v_student_name,
          'status',       new.status,
          'joined_at',    new.joined_at,
          'left_at',      new.left_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public._trg_audit_enrollments() from anon, authenticated, public;

drop trigger if exists trg_audit_enrollments on public.class_enrollments;
create trigger trg_audit_enrollments
  after insert or update of status, left_at on public.class_enrollments
  for each row execute function public._trg_audit_enrollments();

-- 4.3 Lớp học (classes): Tạo / Sửa / Ẩn / Khôi phục
create or replace function public._trg_audit_classes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_teacher text;
  v_new_teacher text;
  v_changes     text[] := '{}';
  v_action      text;
  v_summary     text;
begin
  select t.full_name into v_new_teacher from public.teachers t where t.id = new.teacher_id;

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'class_create', 'classes', new.id, new.id, null,
      format(
        'Tạo lớp %s (Khối %s, GV: %s, đơn giá: %s/buổi)',
        new.name, coalesce(new.grade::text, '-'), coalesce(v_new_teacher, '-'),
        public._fmt_vnd(new.price_per_session)
      ),
      null,
      jsonb_build_object(
        'name',              new.name,
        'subject',           new.subject,
        'grade',             new.grade,
        'class_no',          new.class_no,
        'teacher_name',      v_new_teacher,
        'price_per_session', new.price_per_session
      )
    );
    return new;
  end if;

  select t.full_name into v_old_teacher from public.teachers t where t.id = old.teacher_id;

  if old.name is distinct from new.name then
    v_changes := v_changes || format('tên lớp: %s -> %s', old.name, new.name);
  end if;
  if old.subject is distinct from new.subject then
    v_changes := v_changes || format('môn: %s -> %s', coalesce(old.subject, '-'), coalesce(new.subject, '-'));
  end if;
  if old.grade is distinct from new.grade then
    v_changes := v_changes || format('khối: %s -> %s', coalesce(old.grade::text, '-'), coalesce(new.grade::text, '-'));
  end if;
  if old.teacher_id is distinct from new.teacher_id then
    v_changes := v_changes || format('giáo viên: %s -> %s', coalesce(v_old_teacher, '-'), coalesce(v_new_teacher, '-'));
  end if;
  if old.price_per_session is distinct from new.price_per_session then
    v_changes := v_changes || format(
      'đơn giá: %s -> %s', public._fmt_vnd(old.price_per_session), public._fmt_vnd(new.price_per_session)
    );
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action  := 'class_hide';
    v_summary := format('Ẩn lớp %s', new.name);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action  := 'class_restore';
    v_summary := format('Khôi phục lớp %s', new.name);
  elsif cardinality(v_changes) > 0 then
    v_action  := 'class_update';
    v_summary := format('Cập nhật lớp %s', new.name);
  else
    return new;
  end if;

  if cardinality(v_changes) > 0 then
    v_summary := v_summary || ' (' || array_to_string(v_changes, '; ') || ')';
  end if;

  perform public._write_audit_log(
    v_action, 'classes', new.id, new.id, null, v_summary,
    jsonb_build_object(
      'name',              old.name,
      'subject',           old.subject,
      'grade',             old.grade,
      'class_no',          old.class_no,
      'teacher_name',      v_old_teacher,
      'price_per_session', old.price_per_session,
      'deleted_at',        old.deleted_at
    ),
    jsonb_build_object(
      'name',              new.name,
      'subject',           new.subject,
      'grade',             new.grade,
      'class_no',          new.class_no,
      'teacher_name',      v_new_teacher,
      'price_per_session', new.price_per_session,
      'deleted_at',        new.deleted_at
    )
  );

  return new;
end;
$$;

revoke execute on function public._trg_audit_classes() from anon, authenticated, public;

drop trigger if exists trg_audit_classes on public.classes;
create trigger trg_audit_classes
  after insert or update on public.classes
  for each row execute function public._trg_audit_classes();

-- 4.4 Lịch học của lớp (class_schedules)
--     save_class xóa hết lịch cũ rồi chèn lại lịch mới trong cùng giao dịch.
--     Trigger DELETE lưu "ảnh chụp" lịch cũ vào biến cục bộ giao dịch, trigger INSERT so sánh
--     với lịch mới và chỉ ghi nhật ký khi lịch thật sự thay đổi. Lớp mới tạo không có ảnh chụp
--     cũ nên không ghi (đã nằm trong dòng "Tạo lớp").
create or replace function public._trg_audit_schedules_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select o.class_id,
           string_agg(
             o.day_of_week::text || '|' || substr(o.start_time::text, 1, 5) || '|' || substr(o.end_time::text, 1, 5),
             ';' order by o.day_of_week
           ) as snap
    from old_rows o
    group by o.class_id
  loop
    perform set_config('sciencehub.sched_' || replace(r.class_id::text, '-', ''), r.snap, true);
  end loop;
  return null;
end;
$$;

create or replace function public._trg_audit_schedules_compare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_key      text;
  v_old      text;
  v_class    text;
begin
  for r in
    select n.class_id,
           string_agg(
             n.day_of_week::text || '|' || substr(n.start_time::text, 1, 5) || '|' || substr(n.end_time::text, 1, 5),
             ';' order by n.day_of_week
           ) as snap
    from new_rows n
    group by n.class_id
  loop
    v_key := 'sciencehub.sched_' || replace(r.class_id::text, '-', '');
    v_old := coalesce(current_setting(v_key, true), '');
    perform set_config(v_key, '', true);

    if v_old = '' or v_old = r.snap then
      continue;
    end if;

    select c.name into v_class from public.classes c where c.id = r.class_id;

    perform public._write_audit_log(
      'class_schedule_update', 'class_schedules', r.class_id, r.class_id, null,
      format(
        'Đổi lịch học lớp %s: %s -> %s',
        coalesce(v_class, ''), public._schedule_snap_label(v_old), public._schedule_snap_label(r.snap)
      ),
      jsonb_build_object('class_name', v_class, 'schedule', public._schedule_snap_label(v_old)),
      jsonb_build_object('class_name', v_class, 'schedule', public._schedule_snap_label(r.snap))
    );
  end loop;
  return null;
end;
$$;

revoke execute on function public._trg_audit_schedules_snapshot() from anon, authenticated, public;
revoke execute on function public._trg_audit_schedules_compare()  from anon, authenticated, public;

drop trigger if exists trg_audit_schedules_snapshot on public.class_schedules;
create trigger trg_audit_schedules_snapshot
  after delete on public.class_schedules
  referencing old table as old_rows
  for each statement execute function public._trg_audit_schedules_snapshot();

drop trigger if exists trg_audit_schedules_compare on public.class_schedules;
create trigger trg_audit_schedules_compare
  after insert on public.class_schedules
  referencing new table as new_rows
  for each statement execute function public._trg_audit_schedules_compare();

-- 4.5 Học sinh (students): Tạo / Sửa / Tự ẩn / Tự hiện lại
--     Thay đổi cột grade (do trigger tự gán theo lớp) không được ghi như một lần sửa.
create or replace function public._trg_audit_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_parent text;
  v_new_parent text;
  v_changes    text[] := '{}';
  v_action     text;
  v_summary    text;
begin
  select p.full_name || ' (' || p.phone || ')' into v_new_parent
  from public.parents p where p.id = new.parent_id;

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'student_create', 'students', new.id, null, new.id,
      format('Tạo hồ sơ học sinh %s (%s), phụ huynh: %s', new.full_name, new.student_code, coalesce(v_new_parent, '-')),
      null,
      jsonb_build_object(
        'student_code', new.student_code,
        'full_name',    new.full_name,
        'phone',        new.phone,
        'parent_name',  v_new_parent
      )
    );
    return new;
  end if;

  select p.full_name || ' (' || p.phone || ')' into v_old_parent
  from public.parents p where p.id = old.parent_id;

  if old.full_name is distinct from new.full_name then
    v_changes := v_changes || format('họ tên: %s -> %s', old.full_name, new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    v_changes := v_changes || format('SĐT: %s -> %s', coalesce(old.phone, '-'), coalesce(new.phone, '-'));
  end if;
  if old.parent_id is distinct from new.parent_id then
    v_changes := v_changes || format('phụ huynh: %s -> %s', coalesce(v_old_parent, '-'), coalesce(v_new_parent, '-'));
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action  := 'student_hide';
    v_summary := format('Học sinh %s (%s) tự động ẩn vì đã nghỉ hết các lớp', new.full_name, new.student_code);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action  := 'student_restore';
    v_summary := format('Học sinh %s (%s) tự động hiện lại vì được ghi danh vào lớp', new.full_name, new.student_code);
  elsif cardinality(v_changes) > 0 then
    v_action  := 'student_update';
    v_summary := format(
      'Cập nhật hồ sơ học sinh %s (%s): %s',
      new.full_name, new.student_code, array_to_string(v_changes, '; ')
    );
  else
    return new;
  end if;

  perform public._write_audit_log(
    v_action, 'students', new.id, null, new.id, v_summary,
    jsonb_build_object(
      'student_code', old.student_code,
      'full_name',    old.full_name,
      'phone',        old.phone,
      'parent_name',  v_old_parent,
      'deleted_at',   old.deleted_at
    ),
    jsonb_build_object(
      'student_code', new.student_code,
      'full_name',    new.full_name,
      'phone',        new.phone,
      'parent_name',  v_new_parent,
      'deleted_at',   new.deleted_at
    )
  );

  return new;
end;
$$;

revoke execute on function public._trg_audit_students() from anon, authenticated, public;

drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update on public.students
  for each row execute function public._trg_audit_students();

-- 4.6 Phụ huynh (parents): chỉ ghi khi đổi tên hoặc SĐT (ẩn / hiện tự động theo con không ghi)
create or replace function public._trg_audit_parents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes text[] := '{}';
begin
  if old.full_name is distinct from new.full_name then
    v_changes := v_changes || format('họ tên: %s -> %s', old.full_name, new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    v_changes := v_changes || format('SĐT: %s -> %s', old.phone, new.phone);
  end if;

  if cardinality(v_changes) = 0 then
    return new;
  end if;

  perform public._write_audit_log(
    'parent_update', 'parents', new.id, null, null,
    format('Cập nhật phụ huynh %s (%s): %s', new.full_name, new.parent_code, array_to_string(v_changes, '; ')),
    jsonb_build_object('parent_code', old.parent_code, 'full_name', old.full_name, 'phone', old.phone),
    jsonb_build_object('parent_code', new.parent_code, 'full_name', new.full_name, 'phone', new.phone)
  );

  return new;
end;
$$;

revoke execute on function public._trg_audit_parents() from anon, authenticated, public;

drop trigger if exists trg_audit_parents on public.parents;
create trigger trg_audit_parents
  after update of full_name, phone on public.parents
  for each row execute function public._trg_audit_parents();

-- 4.7 Giáo viên (teachers): Thêm / Sửa / Ẩn / Khôi phục
create or replace function public._trg_audit_teachers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes text[] := '{}';
  v_action  text;
  v_summary text;
begin
  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'teacher_create', 'teachers', new.id, null, null,
      format('Thêm giáo viên %s (SĐT: %s)', new.full_name, coalesce(new.phone, '-')),
      null,
      jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email)
    );
    return new;
  end if;

  if old.full_name is distinct from new.full_name then
    v_changes := v_changes || format('họ tên: %s -> %s', old.full_name, new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    v_changes := v_changes || format('SĐT: %s -> %s', coalesce(old.phone, '-'), coalesce(new.phone, '-'));
  end if;
  if old.email is distinct from new.email then
    v_changes := v_changes || format('email: %s -> %s', coalesce(old.email, '-'), coalesce(new.email, '-'));
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action  := 'teacher_hide';
    v_summary := format('Ẩn giáo viên %s', new.full_name);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action  := 'teacher_restore';
    v_summary := format('Khôi phục giáo viên %s', new.full_name);
  elsif cardinality(v_changes) > 0 then
    v_action  := 'teacher_update';
    v_summary := format('Cập nhật giáo viên %s: %s', new.full_name, array_to_string(v_changes, '; '));
  else
    return new;
  end if;

  perform public._write_audit_log(
    v_action, 'teachers', new.id, null, null, v_summary,
    jsonb_build_object('full_name', old.full_name, 'phone', old.phone, 'email', old.email, 'deleted_at', old.deleted_at),
    jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email, 'deleted_at', new.deleted_at)
  );

  return new;
end;
$$;

revoke execute on function public._trg_audit_teachers() from anon, authenticated, public;

drop trigger if exists trg_audit_teachers on public.teachers;
create trigger trg_audit_teachers
  after insert or update on public.teachers
  for each row execute function public._trg_audit_teachers();

-- 4.8 Tài khoản Giáo viên (profiles): Liên kết / Gỡ / Khóa / Mở khóa
--     DELETE được ghi vì link_teacher_account xóa hồ sơ của tài khoản cũ khi liên kết lại.
create or replace function public._trg_audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.profiles%rowtype;
  v_tname   text;
  v_email   text;
  v_action  text;
  v_summary text;
  v_old     jsonb := null;
  v_new     jsonb := null;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if v_row.role <> 'teacher' then
    return v_row;
  end if;

  select t.full_name into v_tname from public.teachers t where t.id = v_row.teacher_id;
  select u.email into v_email from auth.users u where u.id = v_row.user_id;

  if tg_op = 'INSERT' then
    v_action  := 'teacher_account_link';
    v_summary := format('Liên kết tài khoản %s cho giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    v_new := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', new.active);

  elsif tg_op = 'DELETE' then
    v_action  := 'teacher_account_unlink';
    v_summary := format(
      'Gỡ tài khoản %s của giáo viên %s (tài khoản này mất quyền vào hệ thống)',
      coalesce(v_email, '(đã xóa khỏi Authentication)'), coalesce(v_tname, '')
    );
    v_old := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', old.active);

  else
    if old.active = true and new.active = false then
      v_action  := 'teacher_account_lock';
      v_summary := format('Khóa tài khoản đăng nhập %s của giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    elsif old.active = false and new.active = true then
      v_action  := 'teacher_account_unlock';
      v_summary := format('Mở khóa tài khoản đăng nhập %s của giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    elsif old.teacher_id is distinct from new.teacher_id then
      v_action  := 'teacher_account_link';
      v_summary := format('Đổi liên kết tài khoản %s sang giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    else
      return new;
    end if;
    v_old := jsonb_build_object('email', v_email, 'active', old.active);
    v_new := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', new.active);
  end if;

  perform public._write_audit_log(
    v_action, 'profiles', v_row.teacher_id, null, null, v_summary, v_old, v_new
  );

  return v_row;
end;
$$;

revoke execute on function public._trg_audit_profiles() from anon, authenticated, public;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public._trg_audit_profiles();

-- ---------------------------------------------------------------------
-- 5. RPC dành cho Quản lý
-- ---------------------------------------------------------------------

-- 5.1 Tra cứu nhật ký (lọc theo ngày, vai trò, giáo viên, nhóm thao tác, lớp, học sinh, từ khóa)
create or replace function public.query_audit_logs(
  p_from_date    date    default null,
  p_to_date      date    default null,
  p_actor_role   text    default null,
  p_teacher_id   uuid    default null,
  p_action_group text    default null,
  p_class_id     uuid    default null,
  p_student_id   uuid    default null,
  p_search       text    default null,
  p_limit        integer default 100,
  p_offset       integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text    := nullif(trim(coalesce(p_search, '')), '');
  v_from   timestamptz;
  v_to     timestamptz;
  v_total  integer;
  v_items  jsonb;
begin
  perform public.assert_manager();

  if p_from_date is not null then
    v_from := p_from_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
  end if;
  if p_to_date is not null then
    v_to := (p_to_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  end if;

  with filtered as (
    select l.*
    from public.audit_log l
    where (v_from is null or l.created_at >= v_from)
      and (v_to   is null or l.created_at <  v_to)
      and (coalesce(p_actor_role, '') = '' or l.actor_role = p_actor_role)
      and (p_teacher_id is null or l.actor_teacher_id = p_teacher_id)
      and (p_class_id   is null or l.class_id = p_class_id)
      and (p_student_id is null or l.student_id = p_student_id)
      and (
        coalesce(p_action_group, '') = ''
        or (p_action_group = 'attendance' and l.action in ('attendance_create', 'attendance_update', 'attendance_delete'))
        or (p_action_group = 'makeup'     and l.action = 'makeup_record')
        or (p_action_group = 'enrollment' and l.action in ('enrollment_create', 'enrollment_drop', 'enrollment_transfer'))
        or (p_action_group = 'class'      and l.action in ('class_create', 'class_update', 'class_hide', 'class_restore', 'class_schedule_update'))
        or (p_action_group = 'student'    and l.action in ('student_create', 'student_update', 'student_hide', 'student_restore', 'parent_update'))
        or (p_action_group = 'teacher'    and l.action in ('teacher_create', 'teacher_update', 'teacher_hide', 'teacher_restore',
                                                           'teacher_account_link', 'teacher_account_unlink',
                                                           'teacher_account_lock', 'teacher_account_unlock'))
        or (p_action_group = 'system'     and l.action in ('backup_export', 'audit_log_clear'))
      )
      and (
        v_search is null
        or strpos(lower(l.summary), lower(v_search)) > 0
        or strpos(lower(l.actor_name), lower(v_search)) > 0
      )
  )
  select
    (select count(*) from filtered),
    coalesce(
      (
        select jsonb_agg(to_jsonb(p.*) order by p.created_at desc, p.id desc)
        from (
          select * from filtered
          order by created_at desc, id desc
          limit v_limit offset v_offset
        ) p
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object(
    'total',       coalesce(v_total, 0),
    'limit',       v_limit,
    'offset',      v_offset,
    'school_year', public.vn_school_year_bounds(),
    'items',       v_items
  );
end;
$$;

-- 5.2 Xóa nhật ký cũ để giải phóng dung lượng (ngoại lệ có kiểm soát duy nhất đối với việc xóa nhật ký)
--     Chỉ xóa khi: đúng cụm xác nhận, ngày chốt là ngày đã qua, và số dòng trong file sao lưu vừa tải
--     (p_expected_count) khớp chính xác số dòng sắp xóa.
create or replace function public.clear_audit_logs_before(
  p_before_date    date,
  p_expected_count integer,
  p_confirm_text   text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff  timestamptz;
  v_count   integer;
  v_deleted integer := 0;
begin
  perform public.assert_manager();

  if trim(coalesce(p_confirm_text, '')) <> 'XOA NHAT KY' then
    raise exception 'Trung tâm: Vui lòng nhập đúng cụm từ xác nhận "XOA NHAT KY" sau khi đã tải file sao lưu.';
  end if;
  if p_before_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày chốt nhật ký cần xóa.';
  end if;
  if p_before_date >= public.vn_today() then
    raise exception 'Trung tâm: Chỉ được xóa nhật ký đến hết một ngày đã qua, không được xóa nhật ký của hôm nay.';
  end if;

  v_cutoff := (p_before_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  select count(*) into v_count from public.audit_log where created_at < v_cutoff;

  if p_expected_count is null or p_expected_count <> v_count then
    raise exception 'Trung tâm: Số dòng nhật ký hiện có (%) khác số dòng trong file sao lưu (%). Hãy tải lại file sao lưu rồi thử lại.',
      v_count, coalesce(p_expected_count::text, 'không rõ');
  end if;
  if v_count = 0 then
    raise exception 'Trung tâm: Không có dòng nhật ký nào cần xóa đến hết ngày %.', to_char(p_before_date, 'DD/MM/YYYY');
  end if;

  perform set_config('sciencehub.allow_audit_clear', 'on', true);
  delete from public.audit_log where created_at < v_cutoff;
  get diagnostics v_deleted = row_count;
  perform set_config('sciencehub.allow_audit_clear', 'off', true);

  perform public._write_audit_log(
    'audit_log_clear', 'audit_log', null, null, null,
    format(
      'Quản lý đã sao lưu rồi xóa %s dòng nhật ký đến hết ngày %s để giải phóng dung lượng.',
      v_deleted, to_char(p_before_date, 'DD/MM/YYYY')
    ),
    jsonb_build_object('deleted_count', v_deleted, 'before_date', p_before_date),
    null
  );

  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Chốt quyền EXECUTE
-- ---------------------------------------------------------------------
revoke execute on function public.vn_school_year_bounds(integer)                           from anon, public;
revoke execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                                           from anon, public;
revoke execute on function public.clear_audit_logs_before(date, integer, text)             from anon, public;

grant execute on function public.vn_school_year_bounds(integer)                            to authenticated;
grant execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                                           to authenticated;
grant execute on function public.clear_audit_logs_before(date, integer, text)              to authenticated;

notify pgrst, 'reload schema';
