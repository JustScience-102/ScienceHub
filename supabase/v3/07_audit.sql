-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 07: NHẬT KÝ THAY ĐỔI (AUDIT LOG)
-- Chạy sau 06_rpc_admin.sql. Chạy lại an toàn.
--   * Trigger tự ghi mọi thay đổi trên bảng nghiệp vụ (dù Quản lý hay Giáo viên, qua RPC nào).
--   * Ghi từng dòng; batch_id (mã giao dịch) giúp giao diện gộp các dòng của cùng một lần bấm.
--   * price_snapshot ghi đúng giá đóng băng cũ/mới, không tính lại theo đơn giá hiện tại.
--   * Đổi lịch học, khóa sổ, sao lưu, chuyển năm học, khôi phục: RPC tự ghi (không qua trigger).
--   * Chỉ Quản lý đọc; không ai sửa/xóa (trừ clear_audit_logs_before có kiểm soát).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Năm học của Trung tâm: 15/06/YYYY -> 12/06/(YYYY+1)
-- ---------------------------------------------------------------------
create or replace function public.vn_school_year_bounds(p_start_year integer default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_today date := public.vn_today();
  v_year  integer := extract(year from v_today)::integer;
  v_start integer;
begin
  v_start := coalesce(p_start_year, case when v_today >= make_date(v_year, 6, 15) then v_year else v_year - 1 end);
  return jsonb_build_object(
    'school_year', v_start::text || '-' || (v_start + 1)::text,
    'start_year', v_start, 'end_year', v_start + 1,
    'start_date', make_date(v_start, 6, 15), 'end_date', make_date(v_start + 1, 6, 12)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Bảo vệ toàn vẹn nhật ký
-- ---------------------------------------------------------------------
create or replace function public._trg_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('sciencehub.allow_audit_clear', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Trung tâm: Nhật ký thay đổi được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa trực tiếp.';
end;
$$;

drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public._trg_audit_log_immutable();

drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public._trg_audit_log_immutable();

-- ---------------------------------------------------------------------
-- 3. Hàm phụ định dạng
-- ---------------------------------------------------------------------
create or replace function public._attendance_status_label(p_status text, p_price integer)
returns text
language sql
immutable
as $$
  select case p_status
    when 'present'        then 'Có mặt (' || public._fmt_vnd(p_price) || ')'
    when 'absent'         then 'Vắng tính phí (' || public._fmt_vnd(p_price) || ')'
    when 'absent_excused' then 'Vắng có phép (0đ)'
    else 'Chưa chấm'
  end;
$$;

-- ---------------------------------------------------------------------
-- 4. Trigger ghi nhật ký
-- ---------------------------------------------------------------------

-- 4.1 Điểm danh & học bù
create or replace function public._trg_audit_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       public.attendance_records%rowtype;
  v_class     text;
  v_orig      text;
  v_sname     text;
  v_scode     text;
  v_makeup    boolean;
  v_action    text;
  v_summary   text;
  v_old       jsonb;
  v_new       jsonb;
begin
  if public._is_restoring() then
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.status, old.price_snapshot) is not distinct from (new.status, new.price_snapshot) then
    return null;
  end if;

  v_row := case when tg_op = 'DELETE' then old else new end;
  select c.name into v_class from public.classes c where c.id = v_row.class_id;
  select s.full_name, s.student_code into v_sname, v_scode from public.students s where s.id = v_row.student_id;
  select c.name into v_orig
  from public.class_enrollments e join public.classes c on c.id = e.class_id
  where e.id = v_row.enrollment_id;
  v_makeup := v_row.makeup_of_date is not null or v_orig is distinct from v_class;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := jsonb_strip_nulls(jsonb_build_object(
      'attendance_date', old.attendance_date, 'status', old.status, 'price_snapshot', old.price_snapshot,
      'class_name', v_class, 'orig_class_name', case when v_makeup then v_orig end,
      'makeup_of_date', old.makeup_of_date, 'student_code', v_scode, 'student_name', v_sname, 'is_makeup', v_makeup));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := jsonb_strip_nulls(jsonb_build_object(
      'attendance_date', new.attendance_date, 'status', new.status, 'price_snapshot', new.price_snapshot,
      'class_name', v_class, 'orig_class_name', case when v_makeup then v_orig end,
      'makeup_of_date', new.makeup_of_date, 'student_code', v_scode, 'student_name', v_sname, 'is_makeup', v_makeup));
  end if;

  if tg_op = 'INSERT' and v_makeup then
    v_action := 'makeup_record';
    v_summary := format('Ghi nhận học bù cho %s (%s) tại lớp %s ngày %s, bù cho buổi %s của lớp %s (%s)',
      coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(new.attendance_date),
      coalesce(public._fmt_date(new.makeup_of_date), '?'), coalesce(v_orig, ''),
      public._attendance_status_label(new.status, new.price_snapshot));
  elsif tg_op = 'INSERT' then
    v_action := 'attendance_create';
    v_summary := format('Điểm danh %s (%s) lớp %s ngày %s: %s',
      coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(new.attendance_date),
      public._attendance_status_label(new.status, new.price_snapshot));
  elsif tg_op = 'UPDATE' then
    v_action := 'attendance_update';
    v_summary := format('Đổi điểm danh %s (%s) lớp %s ngày %s: %s -> %s',
      coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(new.attendance_date),
      public._attendance_status_label(old.status, old.price_snapshot),
      public._attendance_status_label(new.status, new.price_snapshot));
  elsif v_makeup then
    v_action := 'makeup_cancel';
    v_summary := format('Hủy học bù của %s (%s) tại lớp %s ngày %s (trước đó: %s)',
      coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(old.attendance_date),
      public._attendance_status_label(old.status, old.price_snapshot));
  else
    v_action := 'attendance_delete';
    v_summary := format('Xóa điểm danh của %s (%s) tại lớp %s ngày %s (trước đó: %s)',
      coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(old.attendance_date),
      public._attendance_status_label(old.status, old.price_snapshot));
  end if;

  perform public._write_audit_log(v_action, 'attendance_records', v_row.id, v_row.class_id, v_row.student_id, v_summary, v_old, v_new);
  return null;
end;
$$;

drop trigger if exists trg_audit_attendance on public.attendance_records;
create trigger trg_audit_attendance
  after insert or update or delete on public.attendance_records
  for each row execute function public._trg_audit_attendance();

-- 4.2 Ghi danh / cho nghỉ / đổi lớp / tốt nghiệp (đọc left_reason, không đoán theo thời điểm như V2)
create or replace function public._trg_audit_enrollments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class  text;
  v_to     text;
  v_sname  text;
  v_scode  text;
  v_action text;
  v_text   text;
begin
  if public._is_restoring() then
    return null;
  end if;
  select c.name into v_class from public.classes c where c.id = new.class_id;
  select s.full_name, s.student_code into v_sname, v_scode from public.students s where s.id = new.student_id;

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'enrollment_create', 'class_enrollments', new.id, new.class_id, new.student_id,
      format('Ghi danh %s (%s) vào lớp %s từ ngày %s', coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''),
             coalesce(v_class, ''), public._fmt_date(new.joined_at)),
      null,
      jsonb_build_object('class_name', v_class, 'student_code', v_scode, 'student_name', v_sname,
                         'status', new.status, 'joined_at', new.joined_at));
    return null;
  end if;

  if not (old.status = 'active' and new.status = 'dropped') then
    return null;
  end if;

  if new.left_reason = 'transferred' then
    select c.name into v_to
    from public.class_enrollments e join public.classes c on c.id = e.class_id
    where e.id = new.transfer_to_id;
    v_action := 'enrollment_transfer';
    v_text := format('Đổi lớp cho %s (%s): từ lớp %s sang lớp %s (ngày chuyển %s)', coalesce(v_sname, 'Học sinh'),
                     coalesce(v_scode, ''), coalesce(v_class, ''), coalesce(v_to, ''), public._fmt_date(new.left_at));
  elsif new.left_reason = 'graduated' then
    v_action := 'enrollment_graduate';
    v_text := format('%s (%s) hoàn thành lớp cuối cấp %s (đóng lớp khi chuyển năm học, ngày %s)', coalesce(v_sname, 'Học sinh'),
                     coalesce(v_scode, ''), coalesce(v_class, ''), public._fmt_date(new.left_at));
  else
    v_action := 'enrollment_drop';
    v_text := format('Cho %s (%s) nghỉ lớp %s từ ngày %s', coalesce(v_sname, 'Học sinh'), coalesce(v_scode, ''),
                     coalesce(v_class, ''), public._fmt_date(new.left_at));
  end if;

  perform public._write_audit_log(
    v_action, 'class_enrollments', new.id, new.class_id, new.student_id, v_text,
    jsonb_build_object('class_name', v_class, 'student_code', v_scode, 'student_name', v_sname,
                       'status', old.status, 'joined_at', old.joined_at),
    jsonb_strip_nulls(jsonb_build_object('class_name', v_class, 'to_class_name', v_to, 'student_code', v_scode,
                       'student_name', v_sname, 'status', new.status, 'left_at', new.left_at, 'left_reason', new.left_reason)));
  return null;
end;
$$;

drop trigger if exists trg_audit_enrollments on public.class_enrollments;
create trigger trg_audit_enrollments
  after insert or update of status on public.class_enrollments
  for each row execute function public._trg_audit_enrollments();

-- 4.3 Lớp học: tạo / sửa (kể cả tên đổi theo giáo viên) / ẩn / khôi phục
create or replace function public._trg_audit_classes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_t   text;
  v_new_t   text;
  v_changes text[] := '{}';
  v_action  text;
  v_summary text;
begin
  if public._is_restoring() then
    return null;
  end if;
  v_new_t := public.teacher_display_name(new.teacher_id);

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'class_create', 'classes', new.id, new.id, null,
      format('Tạo lớp %s (Khối %s, GV: %s, đơn giá: %s/buổi)', new.name, new.grade, coalesce(v_new_t, '-'),
             public._fmt_vnd(new.price_per_session)),
      null,
      jsonb_build_object('name', new.name, 'subject', new.subject, 'grade', new.grade, 'class_no', new.class_no,
                         'teacher_name', v_new_t, 'price_per_session', new.price_per_session));
    return null;
  end if;

  v_old_t := public.teacher_display_name(old.teacher_id);
  if old.name is distinct from new.name then
    v_changes := v_changes || format('tên lớp: %s -> %s', old.name, new.name);
  end if;
  if old.subject is distinct from new.subject then
    v_changes := v_changes || format('môn: %s -> %s', old.subject, new.subject);
  end if;
  if old.grade is distinct from new.grade then
    v_changes := v_changes || format('khối: %s -> %s', old.grade, new.grade);
  end if;
  if old.teacher_id is distinct from new.teacher_id then
    v_changes := v_changes || format('giáo viên: %s -> %s', coalesce(v_old_t, '-'), coalesce(v_new_t, '-'));
  end if;
  if old.price_per_session is distinct from new.price_per_session then
    v_changes := v_changes || format('đơn giá: %s -> %s', public._fmt_vnd(old.price_per_session), public._fmt_vnd(new.price_per_session));
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'class_hide';
    v_summary := format('Ẩn lớp %s', new.name);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'class_restore';
    v_summary := format('Khôi phục lớp %s', new.name);
  elsif cardinality(v_changes) > 0 then
    v_action := 'class_update';
    v_summary := format('Cập nhật lớp %s', new.name);
  else
    return null;
  end if;
  if cardinality(v_changes) > 0 then
    v_summary := v_summary || ' (' || array_to_string(v_changes, '; ') || ')';
  end if;

  perform public._write_audit_log(
    v_action, 'classes', new.id, new.id, null, v_summary,
    jsonb_build_object('name', old.name, 'subject', old.subject, 'grade', old.grade, 'class_no', old.class_no,
                       'teacher_name', v_old_t, 'price_per_session', old.price_per_session, 'deleted_at', old.deleted_at),
    jsonb_build_object('name', new.name, 'subject', new.subject, 'grade', new.grade, 'class_no', new.class_no,
                       'teacher_name', v_new_t, 'price_per_session', new.price_per_session, 'deleted_at', new.deleted_at));
  return null;
end;
$$;

drop trigger if exists trg_audit_classes on public.classes;
create trigger trg_audit_classes
  after insert or update on public.classes
  for each row execute function public._trg_audit_classes();

-- 4.4 Học sinh: tạo / sửa / tự ẩn / tự hiện (đổi khối do hệ thống tự tính thì không ghi)
create or replace function public._trg_audit_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_p   text;
  v_new_p   text;
  v_changes text[] := '{}';
  v_action  text;
  v_summary text;
begin
  if public._is_restoring() then
    return null;
  end if;
  select p.full_name || ' (' || p.phone || ')' into v_new_p from public.parents p where p.id = new.parent_id;

  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'student_create', 'students', new.id, null, new.id,
      format('Tạo hồ sơ học sinh %s (%s), phụ huynh: %s', new.full_name, new.student_code, coalesce(v_new_p, '-')),
      null,
      jsonb_build_object('student_code', new.student_code, 'full_name', new.full_name, 'phone', new.phone, 'parent_name', v_new_p));
    return null;
  end if;

  select p.full_name || ' (' || p.phone || ')' into v_old_p from public.parents p where p.id = old.parent_id;
  if old.full_name is distinct from new.full_name then
    v_changes := v_changes || format('họ tên: %s -> %s', old.full_name, new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    v_changes := v_changes || format('SĐT: %s -> %s', coalesce(old.phone, '-'), coalesce(new.phone, '-'));
  end if;
  if old.parent_id is distinct from new.parent_id then
    v_changes := v_changes || format('phụ huynh: %s -> %s', coalesce(v_old_p, '-'), coalesce(v_new_p, '-'));
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'student_hide';
    v_summary := format('Học sinh %s (%s) tự động ẩn vì đã nghỉ hết các lớp', new.full_name, new.student_code);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'student_restore';
    v_summary := format('Học sinh %s (%s) tự động hiện lại vì được ghi danh vào lớp', new.full_name, new.student_code);
  elsif cardinality(v_changes) > 0 then
    v_action := 'student_update';
    v_summary := format('Cập nhật hồ sơ học sinh %s (%s): %s', new.full_name, new.student_code, array_to_string(v_changes, '; '));
  else
    return null;
  end if;

  perform public._write_audit_log(
    v_action, 'students', new.id, null, new.id, v_summary,
    jsonb_build_object('student_code', old.student_code, 'full_name', old.full_name, 'phone', old.phone,
                       'parent_name', v_old_p, 'deleted_at', old.deleted_at),
    jsonb_build_object('student_code', new.student_code, 'full_name', new.full_name, 'phone', new.phone,
                       'parent_name', v_new_p, 'deleted_at', new.deleted_at));
  return null;
end;
$$;

drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update on public.students
  for each row execute function public._trg_audit_students();

-- 4.5 Phụ huynh: chỉ ghi khi đổi tên hoặc SĐT (ẩn/hiện tự động theo con không ghi)
create or replace function public._trg_audit_parents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes text[] := '{}';
begin
  if public._is_restoring() then
    return null;
  end if;
  if old.full_name is distinct from new.full_name then
    v_changes := v_changes || format('họ tên: %s -> %s', old.full_name, new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    v_changes := v_changes || format('SĐT: %s -> %s', old.phone, new.phone);
  end if;
  if cardinality(v_changes) = 0 then
    return null;
  end if;
  perform public._write_audit_log(
    'parent_update', 'parents', new.id, null, null,
    format('Cập nhật phụ huynh %s (%s): %s', new.full_name, new.parent_code, array_to_string(v_changes, '; ')),
    jsonb_build_object('parent_code', old.parent_code, 'full_name', old.full_name, 'phone', old.phone),
    jsonb_build_object('parent_code', new.parent_code, 'full_name', new.full_name, 'phone', new.phone));
  return null;
end;
$$;

drop trigger if exists trg_audit_parents on public.parents;
create trigger trg_audit_parents
  after update of full_name, phone on public.parents
  for each row execute function public._trg_audit_parents();

-- 4.6 Giáo viên: thêm / sửa / ẩn / khôi phục
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
  if public._is_restoring() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public._write_audit_log(
      'teacher_create', 'teachers', new.id, null, null,
      format('Thêm giáo viên %s (SĐT: %s)', new.full_name, coalesce(new.phone, '-')),
      null, jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email));
    return null;
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
    v_action := 'teacher_hide';
    v_summary := format('Ẩn giáo viên %s', new.full_name);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'teacher_restore';
    v_summary := format('Khôi phục giáo viên %s', new.full_name);
  elsif cardinality(v_changes) > 0 then
    v_action := 'teacher_update';
    v_summary := format('Cập nhật giáo viên %s: %s', new.full_name, array_to_string(v_changes, '; '));
  else
    return null;
  end if;

  perform public._write_audit_log(
    v_action, 'teachers', new.id, null, null, v_summary,
    jsonb_build_object('full_name', old.full_name, 'phone', old.phone, 'email', old.email, 'deleted_at', old.deleted_at),
    jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email, 'deleted_at', new.deleted_at));
  return null;
end;
$$;

drop trigger if exists trg_audit_teachers on public.teachers;
create trigger trg_audit_teachers
  after insert or update on public.teachers
  for each row execute function public._trg_audit_teachers();

-- 4.7 Tài khoản Giáo viên: liên kết / gỡ / khóa / mở khóa
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
  v_old     jsonb;
  v_new     jsonb;
begin
  if public._is_restoring() then
    return null;
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.role <> 'teacher' then
    return null;
  end if;
  v_tname := public.teacher_display_name(v_row.teacher_id);
  select u.email into v_email from auth.users u where u.id = v_row.user_id;

  if tg_op = 'INSERT' then
    v_action := 'teacher_account_link';
    v_summary := format('Liên kết tài khoản %s cho giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    v_new := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', new.active);
  elsif tg_op = 'DELETE' then
    v_action := 'teacher_account_unlink';
    v_summary := format('Gỡ tài khoản %s của giáo viên %s (tài khoản này mất quyền vào hệ thống)',
                        coalesce(v_email, '(đã xóa khỏi Authentication)'), coalesce(v_tname, ''));
    v_old := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', old.active);
  else
    if old.active and not new.active then
      v_action := 'teacher_account_lock';
      v_summary := format('Khóa tài khoản đăng nhập %s của giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    elsif not old.active and new.active then
      v_action := 'teacher_account_unlock';
      v_summary := format('Mở khóa tài khoản đăng nhập %s của giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    elsif old.teacher_id is distinct from new.teacher_id then
      v_action := 'teacher_account_link';
      v_summary := format('Đổi liên kết tài khoản %s sang giáo viên %s', coalesce(v_email, ''), coalesce(v_tname, ''));
    else
      return null;
    end if;
    v_old := jsonb_build_object('email', v_email, 'active', old.active);
    v_new := jsonb_build_object('email', v_email, 'teacher_name', v_tname, 'active', new.active);
  end if;

  perform public._write_audit_log(v_action, 'profiles', v_row.teacher_id, null, null, v_summary, v_old, v_new);
  return null;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public._trg_audit_profiles();

-- ---------------------------------------------------------------------
-- 5. RPC chỉ Quản lý
-- ---------------------------------------------------------------------

-- Tra cứu nhật ký. p_action_group: attendance | makeup | enrollment | class | student | teacher | system.
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
  v_search text    := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_from   timestamptz := case when p_from_date is not null then p_from_date::timestamp at time zone 'Asia/Ho_Chi_Minh' end;
  v_to     timestamptz := case when p_to_date is not null then (p_to_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' end;
  v_total  integer;
  v_items  jsonb;
begin
  perform public.assert_manager();

  with filtered as (
    select l.*
    from public.audit_log l
    where (v_from is null or l.created_at >= v_from)
      and (v_to is null or l.created_at < v_to)
      and (coalesce(p_actor_role, '') = '' or l.actor_role = p_actor_role)
      and (p_teacher_id is null or l.actor_teacher_id = p_teacher_id)
      and (coalesce(p_action_group, '') = '' or l.action_group = p_action_group)
      and (p_class_id is null or l.class_id = p_class_id)
      and (p_student_id is null or l.student_id = p_student_id)
      and (v_search is null or strpos(lower(l.summary), v_search) > 0 or strpos(lower(l.actor_name), v_search) > 0)
  )
  select (select count(*) from filtered),
         coalesce((select jsonb_agg(to_jsonb(p.*) order by p.created_at desc, p.id desc)
                   from (select * from filtered order by created_at desc, id desc limit v_limit offset v_offset) p),
                  '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', coalesce(v_total, 0), 'limit', v_limit, 'offset', v_offset,
                            'school_year', public.vn_school_year_bounds(), 'items', v_items);
end;
$$;

-- Xóa nhật ký cũ (ngoại lệ có kiểm soát duy nhất): đúng cụm xác nhận, ngày chốt đã qua, và số dòng
-- trong file sao lưu vừa tải (p_expected_count) khớp số dòng sắp xóa.
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
  v_deleted integer;
begin
  perform public.assert_manager();
  if btrim(coalesce(p_confirm_text, '')) <> 'XOA NHAT KY' then
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
    raise exception 'Trung tâm: Không có dòng nhật ký nào cần xóa đến hết ngày %.', public._fmt_date(p_before_date);
  end if;

  perform set_config('sciencehub.allow_audit_clear', 'on', true);
  delete from public.audit_log where created_at < v_cutoff;
  get diagnostics v_deleted = row_count;
  perform set_config('sciencehub.allow_audit_clear', '', true);

  perform public._write_audit_log(
    'audit_log_clear', 'audit_log', null, null, null,
    format('Quản lý đã sao lưu rồi xóa %s dòng nhật ký đến hết ngày %s để giải phóng dung lượng.', v_deleted, public._fmt_date(p_before_date)),
    jsonb_build_object('deleted_count', v_deleted, 'before_date', p_before_date), null);
  return v_deleted;
end;
$$;
