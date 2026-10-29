-- =====================================================================
-- Trung tâm ScienceHub - FILE 10: V2-7 KHÔI PHỤC TỪ FILE SAO LƯU (.json)
-- Chạy SAU 09_v2_6_year_rollover.sql. An toàn khi chạy lại nhiều lần.
-- KHÔNG chạy lại 02_triggers.sql, 03_rpc_and_auth.sql và 09_v2_6_year_rollover.sql sau file này
-- (file 09 sẽ ghi đè query_audit_logs; file 09 có chốt chặn tự từ chối).
--
-- Chức năng (chỉ Quản lý gọi được, assert_manager() ở dòng đầu):
--   Đưa dữ liệu nghiệp vụ về ĐÚNG trạng thái trong file sao lưu do export_center_backup xuất ra
--   (thay thế toàn bộ, không trộn dữ liệu mới và cũ), trong MỘT giao dịch: lỗi ở bước nào thì hủy hết.
--
-- Quy tắc đã chốt:
--   * Thay thế: parents, teachers, students, classes, class_schedules, class_enrollments,
--     attendance_records, class_versions (file không có class_versions thì coi như rỗng).
--   * GIỮ NGUYÊN: tài khoản Quản lý (profiles role = 'manager') và toàn bộ nhật ký thay đổi (audit_log).
--     Chỉ ghi thêm 1 dòng 'center_restore'. Nhật ký trong file KHÔNG được nạp lại.
--   * Tài khoản Giáo viên (profiles role = 'teacher') lấy theo file, chỉ nạp những tài khoản còn tồn tại trong
--     Supabase Authentication và còn giáo viên tương ứng; còn lại được báo trong cảnh báo.
--   * Bộ đếm mã HS/PH không lùi (setval theo giá trị lớn hơn giữa hiện tại và mã lớn nhất trong file).
--   * File lớn được tải lên theo từng phần vào bảng tạm restore_staging (restore_stage_chunk),
--     rồi restore_center_backup xem trước (p_dry_run = true: chạy thật rồi hoàn tác) hoặc áp dụng.
--   * Trigger nghiệp vụ của các bảng bị tạm tắt TRONG giao dịch (khóa ngoại, ràng buộc định dạng và
--     duy nhất vẫn chạy) và bật lại trước khi kết thúc.
-- Đây là ngoại lệ có kiểm soát của quy tắc cấm xóa dữ liệu nghiệp vụ (xem RULES.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng tạm chứa file sao lưu đang tải lên (chỉ RPC SECURITY DEFINER đọc/ghi được)
-- ---------------------------------------------------------------------
create table if not exists public.restore_staging (
  run_id      uuid        not null,
  table_name  text        not null,
  chunk_no    integer     not null check (chunk_no >= 0),
  rows        jsonb       not null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (run_id, table_name, chunk_no)
);

alter table public.restore_staging enable row level security;
revoke all on table public.restore_staging from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 2. Tải từng phần của file lên bảng tạm
--    _metadata (chunk 0): object {center, version, exported_at, file_counts, staged_counts}
--    Các bảng khác: mảng dòng dữ liệu (tối đa 2000 dòng mỗi phần).
-- ---------------------------------------------------------------------
create or replace function public.restore_stage_chunk(
  p_run_id uuid,
  p_table  text,
  p_chunk  integer,
  p_rows   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();

  if p_run_id is null or p_chunk is null or p_chunk < 0 then
    raise exception 'Trung tâm: Thông tin tải file sao lưu không hợp lệ.';
  end if;
  if p_table is null or not (p_table = any (array[
       '_metadata', 'teachers', 'parents', 'students', 'classes', 'class_schedules',
       'class_enrollments', 'attendance_records', 'class_versions', 'profiles'])) then
    raise exception 'Trung tâm: Bảng "%" không nằm trong danh sách được phép khôi phục.', coalesce(p_table, '');
  end if;

  if p_table = '_metadata' then
    if p_rows is null or jsonb_typeof(p_rows) <> 'object' then
      raise exception 'Trung tâm: Thông tin mô tả file sao lưu không hợp lệ.';
    end if;
  else
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
      raise exception 'Trung tâm: Dữ liệu bảng "%" trong file sao lưu không hợp lệ.', p_table;
    end if;
    if jsonb_array_length(p_rows) > 2000 then
      raise exception 'Trung tâm: Mỗi phần tải lên tối đa 2000 dòng.';
    end if;
  end if;

  -- Dọn các lần tải dở dang từ hơn 1 ngày trước.
  delete from public.restore_staging where created_at < now() - interval '1 day';

  insert into public.restore_staging (run_id, table_name, chunk_no, rows, created_by)
  values (p_run_id, p_table, p_chunk, p_rows, auth.uid())
  on conflict (run_id, table_name, chunk_no)
  do update set rows = excluded.rows, created_by = excluded.created_by, created_at = now();
end;
$$;

create or replace function public.restore_stage_abort(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manager();
  delete from public.restore_staging where run_id = p_run_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Hàm nội bộ: thực hiện khôi phục (ném lỗi nếu sai; người gọi quyết định giữ hay hoàn tác)
-- ---------------------------------------------------------------------
create or replace function public._restore_apply(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_disable  constant text[] := array[
    'profiles', 'class_versions', 'attendance_records', 'class_enrollments',
    'class_schedules', 'classes', 'students', 'parents', 'teachers'
  ];
  c_insert   constant text[] := array[
    'teachers', 'parents', 'students', 'classes', 'class_schedules',
    'class_enrollments', 'attendance_records', 'class_versions'
  ];
  t          text;
  v_expected integer;
  v_actual   integer;
  v_warnings jsonb   := '[]'::jsonb;
  v_prof_all integer := 0;
  v_prof_ok  integer := 0;
  v_mixed    integer;
  v_last     bigint;
  v_called   boolean;
  v_max      bigint;
  v_counts   jsonb   := '{}'::jsonb;
  v_meta     jsonb;
begin
  select s.rows into v_meta
  from public.restore_staging s
  where s.run_id = p_run_id and s.table_name = '_metadata' and s.chunk_no = 0;

  foreach t in array c_disable loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  -- Xóa theo thứ tự ngược phụ thuộc (WHERE true để qua cả cấu hình chặn DELETE không điều kiện của API).
  delete from public.attendance_records where true;
  delete from public.class_enrollments   where true;
  delete from public.class_schedules     where true;
  delete from public.class_versions      where true;
  delete from public.classes             where true;
  delete from public.students            where true;
  delete from public.parents             where true;
  delete from public.profiles            where role = 'teacher';
  delete from public.teachers            where true;

  -- Nạp lại theo thứ tự xuôi. jsonb_populate_recordset bỏ qua cột thừa và để NULL cột thiếu của file cũ.
  foreach t in array c_insert loop
    execute format(
      'insert into public.%I select r.* from public.restore_staging s '
      'cross join lateral jsonb_populate_recordset(null::public.%I, s.rows) r '
      'where s.run_id = $1 and s.table_name = $2',
      t, t
    ) using p_run_id, t;
  end loop;

  -- Tài khoản Giáo viên: chỉ nạp khi tài khoản còn trong Authentication và giáo viên còn tồn tại.
  select count(*) into v_prof_all
  from public.restore_staging s
  cross join lateral jsonb_to_recordset(s.rows)
       as p(user_id uuid, role text, teacher_id uuid, active boolean, created_at timestamptz)
  where s.run_id = p_run_id and s.table_name = 'profiles' and p.role = 'teacher';

  insert into public.profiles (user_id, role, teacher_id, active, created_at)
  select p.user_id, 'teacher', p.teacher_id, coalesce(p.active, false), coalesce(p.created_at, now())
  from public.restore_staging s
  cross join lateral jsonb_to_recordset(s.rows)
       as p(user_id uuid, role text, teacher_id uuid, active boolean, created_at timestamptz)
  where s.run_id = p_run_id and s.table_name = 'profiles' and p.role = 'teacher'
    and exists (select 1 from auth.users u where u.id = p.user_id)
    and exists (select 1 from public.teachers th where th.id = p.teacher_id)
    and not exists (select 1 from public.profiles pr where pr.user_id = p.user_id)
    and not exists (select 1 from public.profiles pr where pr.teacher_id = p.teacher_id);
  get diagnostics v_prof_ok = row_count;

  if v_prof_all > v_prof_ok then
    v_warnings := v_warnings || to_jsonb(format(
      '%s tài khoản giáo viên trong file không được khôi phục vì tài khoản đăng nhập không còn trong Supabase Authentication (hoặc đã trùng). Hãy liên kết lại tài khoản ở trang Giáo viên.',
      v_prof_all - v_prof_ok
    ));
  end if;
  if not exists (select 1 from public.restore_staging s where s.run_id = p_run_id and s.table_name = 'profiles') then
    v_warnings := v_warnings || to_jsonb(
      'File sao lưu không có danh sách tài khoản nên tài khoản giáo viên hiện tại đã bị gỡ. Hãy liên kết lại tài khoản ở trang Giáo viên.'::text
    );
  end if;

  -- Bộ đếm mã HS/PH không lùi.
  select last_value, is_called into v_last, v_called from public.student_code_seq;
  select coalesce(max(substring(student_code from 3)::bigint), 0) into v_max from public.students;
  perform setval('public.student_code_seq', greatest(case when v_called then v_last else 0 end, v_max, 1), true);

  select last_value, is_called into v_last, v_called from public.parent_code_seq;
  select coalesce(max(substring(parent_code from 3)::bigint), 0) into v_max from public.parents;
  perform setval('public.parent_code_seq', greatest(case when v_called then v_last else 0 end, v_max, 1), true);

  -- Bật lại trigger.
  foreach t in array c_disable loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- Kiểm tra cuối: số dòng từng bảng khớp số dòng đã tải lên.
  foreach t in array c_insert loop
    select coalesce(sum(jsonb_array_length(s.rows)), 0)::integer into v_expected
    from public.restore_staging s where s.run_id = p_run_id and s.table_name = t;
    execute format('select count(*) from public.%I', t) into v_actual;
    if v_actual <> v_expected then
      raise exception 'Trung tâm: Số dòng bảng % sau khi khôi phục (%) khác số dòng trong file (%). Toàn bộ thay đổi đã được hủy.',
        t, v_actual, v_expected;
    end if;
    v_counts := v_counts || jsonb_build_object(t, v_actual);
  end loop;

  select count(*) into v_mixed from (
    select s.id
    from public.students s
    join public.class_enrollments e on e.student_id = s.id and e.status = 'active'
    where public.class_effective_grade(e.class_id) is not null
    group by s.id
    having count(distinct public.class_effective_grade(e.class_id)) > 1
  ) x;
  if v_mixed > 0 then
    v_warnings := v_warnings || to_jsonb(format(
      '%s học sinh trong file đang học các lớp khác khối (file có thể từ phiên bản cũ). Hệ thống giữ nguyên dữ liệu như file.', v_mixed
    ));
  end if;

  perform public._write_audit_log(
    'center_restore', 'center_backup', null, null, null,
    format(
      'Quản lý khôi phục dữ liệu từ file sao lưu xuất lúc %s: %s học sinh, %s lớp, %s buổi điểm danh.',
      coalesce(v_meta->>'exported_at', 'không rõ'),
      v_counts->>'students', v_counts->>'classes', v_counts->>'attendance_records'
    ),
    null,
    jsonb_build_object(
      'file_exported_at',    v_meta->>'exported_at',
      'restored_students',   (v_counts->>'students')::integer,
      'restored_classes',    (v_counts->>'classes')::integer,
      'restored_enrollments',(v_counts->>'class_enrollments')::integer,
      'restored_attendance', (v_counts->>'attendance_records')::integer
    )
  );

  delete from public.restore_staging where run_id = p_run_id;

  return jsonb_build_object('warnings', v_warnings, 'counts', v_counts);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC công khai: xem trước hoặc khôi phục
-- ---------------------------------------------------------------------
create or replace function public.restore_center_backup(
  p_run_id       uuid,
  p_dry_run      boolean default true,
  p_confirm_text text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_required constant text[] := array[
    'teachers', 'parents', 'students', 'classes', 'class_schedules',
    'class_enrollments', 'attendance_records'
  ];
  c_diff     constant text[] := array[
    'teachers', 'parents', 'students', 'classes', 'class_schedules',
    'class_enrollments', 'attendance_records', 'class_versions'
  ];
  v_dry      boolean := coalesce(p_dry_run, true);
  v_meta     jsonb;
  v_errors   jsonb   := '[]'::jsonb;
  v_warnings jsonb   := '[]'::jsonb;
  v_tables   jsonb   := '[]'::jsonb;
  v_result   jsonb;
  v_msg      text;
  t          text;
  v_chunks   integer;
  v_maxchunk integer;
  v_rows     integer;
  v_declared integer;
  v_filecnt  integer;
  v_cur      integer;
  v_file     integer;
  v_added    integer;
  v_removed  integer;
begin
  perform public.assert_manager();

  if p_run_id is null then
    raise exception 'Trung tâm: Thiếu mã lần khôi phục. Hãy chọn lại file sao lưu.';
  end if;
  if not v_dry and trim(coalesce(p_confirm_text, '')) <> 'KHOI PHUC' then
    raise exception 'Trung tâm: Vui lòng nhập đúng cụm từ xác nhận "KHOI PHUC".';
  end if;

  select s.rows into v_meta
  from public.restore_staging s
  where s.run_id = p_run_id and s.table_name = '_metadata' and s.chunk_no = 0
    and s.created_by is not distinct from auth.uid();
  if v_meta is null then
    raise exception 'Trung tâm: Không tìm thấy dữ liệu file sao lưu đã tải lên (có thể đã hết hạn). Hãy chọn lại file và xem trước.';
  end if;

  if coalesce(v_meta->>'center', '') <> 'Trung tâm ScienceHub' then
    v_errors := v_errors || to_jsonb('File này không phải bản sao lưu của Trung tâm ScienceHub.'::text);
  end if;

  -- Mỗi bảng: các phần liên tục từ 0, tổng số dòng khớp số đã tải và số dòng file tự khai báo.
  foreach t in array c_required || array['class_versions', 'profiles'] loop
    select count(*), coalesce(max(s.chunk_no), -1), coalesce(sum(jsonb_array_length(s.rows)), 0)::integer
      into v_chunks, v_maxchunk, v_rows
    from public.restore_staging s
    where s.run_id = p_run_id and s.table_name = t;

    if v_chunks = 0 then
      if t = any (c_required) then
        v_errors := v_errors || to_jsonb(format('File sao lưu thiếu dữ liệu bảng "%s".', t));
      end if;
      continue;
    end if;

    if v_chunks <> v_maxchunk + 1 then
      v_errors := v_errors || to_jsonb(format('Dữ liệu bảng "%s" tải lên bị thiếu phần. Hãy chọn lại file.', t));
    end if;

    v_declared := nullif(v_meta->'staged_counts'->>t, '')::integer;
    if v_declared is null or v_declared <> v_rows then
      v_errors := v_errors || to_jsonb(format(
        'Số dòng bảng "%s" tải lên (%s) không khớp số dòng đã gửi (%s). Hãy chọn lại file.', t, v_rows, coalesce(v_declared::text, 'không rõ')
      ));
    end if;

    v_filecnt := nullif(v_meta->'file_counts'->>t, '')::integer;
    if v_filecnt is not null and v_filecnt <> v_rows then
      v_errors := v_errors || to_jsonb(format(
        'File sao lưu có thể bị cắt hoặc hỏng: bảng "%s" khai báo %s dòng nhưng chỉ có %s dòng.', t, v_filecnt, v_rows
      ));
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'dry_run', v_dry, 'ok', false, 'applied', false,
      'file', jsonb_build_object('center', v_meta->>'center', 'version', v_meta->>'version', 'exported_at', v_meta->>'exported_at'),
      'tables', '[]'::jsonb, 'warnings', v_warnings, 'errors', v_errors
    );
  end if;

  -- Bảng so sánh: hiện có / trong file / sẽ thêm lại / sẽ mất (so theo id).
  foreach t in array c_diff loop
    execute format(
      'with f as ('
      '  select (e->>''id'')::uuid as id from public.restore_staging s '
      '  cross join lateral jsonb_array_elements(s.rows) e '
      '  where s.run_id = $1 and s.table_name = $2) '
      'select (select count(*) from public.%1$I), (select count(*) from f), '
      '       (select count(*) from (select id from f except select id from public.%1$I) a), '
      '       (select count(*) from (select id from public.%1$I except select id from f) b)',
      t
    ) into v_cur, v_file, v_added, v_removed using p_run_id, t;

    v_tables := v_tables || jsonb_build_object(
      'name', t, 'current', v_cur, 'in_file', v_file, 'added', v_added, 'removed', v_removed
    );
  end loop;

  if v_dry then
    -- Chạy thật trong khối con rồi hoàn tác bằng ngoại lệ có chủ đích; kết quả đi kèm trong thông báo.
    begin
      v_result := public._restore_apply(p_run_id);
      raise exception '%', v_result::text using errcode = 'SH002';
    exception
      when sqlstate 'SH002' then
        get stacked diagnostics v_msg = message_text;
        v_result := v_msg::jsonb;
      when others then
        get stacked diagnostics v_msg = message_text;
        return jsonb_build_object(
          'dry_run', true, 'ok', false, 'applied', false,
          'file', jsonb_build_object('center', v_meta->>'center', 'version', v_meta->>'version', 'exported_at', v_meta->>'exported_at'),
          'tables', v_tables, 'warnings', v_warnings, 'errors', jsonb_build_array(v_msg)
        );
    end;
  else
    v_result := public._restore_apply(p_run_id);
  end if;

  return jsonb_build_object(
    'dry_run',  v_dry,
    'ok',       true,
    'applied',  not v_dry,
    'file',     jsonb_build_object('center', v_meta->>'center', 'version', v_meta->>'version', 'exported_at', v_meta->>'exported_at'),
    'tables',   v_tables,
    'warnings', v_warnings || (v_result->'warnings'),
    'errors',   '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. query_audit_logs: nhóm "Hệ thống" gồm thêm center_restore (phần còn lại giữ nguyên file 09)
-- ---------------------------------------------------------------------
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
        or (p_action_group = 'system'     and l.action in ('backup_export', 'audit_log_clear', 'school_year_rollover', 'center_restore'))
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

-- ---------------------------------------------------------------------
-- 6. Chốt quyền EXECUTE
-- ---------------------------------------------------------------------
revoke execute on function public.restore_stage_chunk(uuid, text, integer, jsonb)   from anon, public;
revoke execute on function public.restore_stage_abort(uuid)                         from anon, public;
revoke execute on function public.restore_center_backup(uuid, boolean, text)        from anon, public;
revoke execute on function public._restore_apply(uuid)                              from anon, authenticated, public;
revoke execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                                    from anon, public;

grant execute on function public.restore_stage_chunk(uuid, text, integer, jsonb)    to authenticated;
grant execute on function public.restore_stage_abort(uuid)                          to authenticated;
grant execute on function public.restore_center_backup(uuid, boolean, text)         to authenticated;
grant execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                                    to authenticated;

notify pgrst, 'reload schema';
