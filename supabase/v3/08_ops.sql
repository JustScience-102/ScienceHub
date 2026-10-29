-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 08: VẬN HÀNH (SAO LƯU, BÁO CÁO, NHẬP CSV, CHUYỂN NĂM HỌC, KHÔI PHỤC)
-- Chạy sau 07_audit.sql. Chạy lại an toàn. Mọi RPC ở đây chỉ Quản lý gọi được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sao lưu JSON (mỗi lần xuất ghi 1 dòng nhật ký backup_export)
-- ---------------------------------------------------------------------
create or replace function public.export_center_backup(
  p_include_audit_log boolean default true,
  p_tables            text[]  default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_all    constant text[] := array[
    'parents', 'teachers', 'students', 'classes', 'class_schedules', 'class_enrollments',
    'attendance_records', 'profiles', 'class_versions', 'month_closures', 'audit_log'
  ];
  v_want   text[] := coalesce(p_tables, c_all);
  v_name   text;
  v_data   jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
begin
  perform public.assert_manager();

  foreach v_name in array v_want loop
    if not (v_name = any (c_all)) then
      raise exception 'Trung tâm: Bảng "%" không nằm trong danh sách được phép sao lưu.', v_name;
    end if;
  end loop;
  if not coalesce(p_include_audit_log, true) then
    v_want := array_remove(v_want, 'audit_log');
  end if;

  foreach v_name in array c_all loop
    continue when not (v_name = any (v_want));
    if v_name = 'profiles' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', pr.user_id, 'email', u.email, 'role', pr.role, 'teacher_id', pr.teacher_id,
               'active', pr.active, 'created_at', pr.created_at) order by pr.role, pr.created_at, pr.user_id), '[]'::jsonb)
        into v_data
      from public.profiles pr left join auth.users u on u.id = pr.user_id;
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x.*) order by %s), ''[]''::jsonb) from public.%I x',
        case v_name
          when 'parents' then 'x.parent_code'
          when 'students' then 'x.student_code'
          when 'teachers' then 'x.created_at, x.id'
          when 'classes' then 'x.created_at, x.id'
          when 'month_closures' then 'x.month_start'
          when 'audit_log' then 'x.created_at desc, x.id desc'
          else 'x.created_at, x.id'
        end,
        v_name
      ) into v_data;
    end if;
    v_tables := v_tables || jsonb_build_object(v_name, v_data);
    v_counts := v_counts || jsonb_build_object(v_name, jsonb_array_length(v_data));
  end loop;

  -- Ghi nhật ký SAU khi đã đọc audit_log, để dòng này không nằm trong chính file vừa xuất.
  perform public._write_audit_log(
    'backup_export', 'backup', null, null, null,
    format('Quản lý xuất dữ liệu sao lưu (%s)', array_to_string(v_want, ', ')),
    null, jsonb_build_object('tables', to_jsonb(v_want), 'counts', v_counts));

  return jsonb_build_object(
    'metadata', jsonb_build_object(
      'center', 'Trung tâm ScienceHub', 'version', 'V3', 'schema_version',
      (select max(version) from public.schema_migrations),
      'exported_at', now(), 'vn_date', public.vn_today(), 'school_year', public.vn_school_year_bounds(),
      'counts', v_counts),
    'tables', v_tables
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Báo cáo điểm danh & học phí theo tháng (cộng price_snapshot; học bù cộng về lớp GỐC;
--    tên lớp/giáo viên theo nhãn tại ngày điểm danh cuối của dòng trong tháng)
-- ---------------------------------------------------------------------
create or replace function public.export_monthly_attendance_report(p_year integer, p_month integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_next  date;
  v_rows  jsonb;
begin
  perform public.assert_manager();
  if p_year is null or p_month is null or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Trung tâm: Tháng hoặc năm xuất báo cáo không hợp lệ.';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_next  := (v_start + interval '1 month')::date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'student_code', y.student_code, 'student_name', y.student_name, 'student_phone', y.student_phone,
           'grade', y.grade, 'parent_code', y.parent_code, 'parent_name', y.parent_name, 'parent_phone', y.parent_phone,
           'class_name', y.class_name, 'subject', y.subject, 'teacher_name', y.teacher_name,
           'enrollment_status', y.enrollment_status, 'joined_at', y.joined_at, 'left_at', y.left_at,
           'present_count', y.present_count, 'makeup_count', y.makeup_count, 'absent_count', y.absent_count,
           'excused_count', y.excused_count, 'charged_sessions', y.charged_sessions, 'total_tuition', y.total_tuition
         ) order by y.class_name, y.student_name, y.enrollment_id), '[]'::jsonb)
    into v_rows
  from (
    select x.*, coalesce((l.label->>'grade')::smallint, x.student_grade) as grade,
           coalesce(l.label->>'name', '') as class_name, coalesce(l.label->>'subject', '') as subject,
           coalesce(l.label->>'teacher_name', '') as teacher_name
    from (
      select e.id as enrollment_id, e.class_id, s.student_code, s.full_name as student_name,
             coalesce(s.phone, '') as student_phone, s.grade as student_grade,
             coalesce(p.parent_code, '') as parent_code, coalesce(p.full_name, '') as parent_name,
             coalesce(p.phone, '') as parent_phone, e.status as enrollment_status, e.joined_at, e.left_at,
             coalesce(max(a.attendance_date), v_start) as ref_date,
             count(a.id) filter (where a.status = 'present' and a.class_id = e.class_id)  as present_count,
             count(a.id) filter (where a.status = 'present' and a.class_id <> e.class_id) as makeup_count,
             count(a.id) filter (where a.status = 'absent')                              as absent_count,
             count(a.id) filter (where a.status = 'absent_excused')                      as excused_count,
             count(a.id) filter (where a.status in ('present', 'absent'))                as charged_sessions,
             coalesce(sum(a.price_snapshot) filter (where a.status in ('present', 'absent')), 0) as total_tuition
      from public.class_enrollments e
      join public.students s on s.id = e.student_id
      left join public.parents p on p.id = s.parent_id
      left join public.attendance_records a
        on a.enrollment_id = e.id and a.attendance_date >= v_start and a.attendance_date < v_next
      where e.joined_at < v_next and (e.left_at is null or e.left_at >= v_start)
      group by e.id, s.id, p.id
    ) x
    cross join lateral (select public.class_label_on(x.class_id, x.ref_date) as label) l
  ) y;

  perform public._write_audit_log(
    'backup_export', 'backup', null, null, null,
    format('Quản lý xuất báo cáo điểm danh và học phí tháng %s/%s', p_month, p_year),
    null, jsonb_build_object('year', p_year, 'month', p_month, 'rows', jsonb_array_length(v_rows)));

  return jsonb_build_object('year', p_year, 'month', p_month, 'month_closed', public.month_is_closed(v_start), 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Nhập học sinh hàng loạt từ CSV (tối đa 500 dòng). p_dry_run = true chỉ kiểm tra, không ghi gì.
--    Mỗi dòng: {line, student_name, student_phone, parent_name, parent_phone, class_name, joined_at}.
--    Học sinh nhận diện bằng họ tên (không phân biệt hoa/thường) + SĐT phụ huynh; đã có thì chỉ ghi danh thêm.
-- ---------------------------------------------------------------------
create or replace function public._import_norm_name(p_text text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.import_students_bulk(p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows  constant integer := 500;
  c_temp_name constant text    := '(Chưa cập nhật tên)';
  v_today      date := public.vn_today();
  v_total      integer;
  v_item       jsonb;
  v_idx        integer := 0;
  v_line       integer;
  v_row_ok     boolean;
  v_date_ok    boolean;
  v_first      boolean;
  v_sname      text;
  v_sphone     text;
  v_pname      text;
  v_pphone     text;
  v_cname      text;
  v_joined_txt text;
  v_joined     date;
  v_class      public.classes%rowtype;
  v_pkey       text;
  v_skey       text;
  v_parent     jsonb;
  v_student    jsonb;
  v_pid        uuid;
  v_sid        uuid;
  v_cnt        integer;
  v_exname     text;
  v_exphone    text;
  v_grades     jsonb;
  v_errors     jsonb := '[]'::jsonb;
  v_warnings   jsonb := '[]'::jsonb;
  v_missing    jsonb := '[]'::jsonb;
  v_plan       jsonb := '[]'::jsonb;
  m_parents    jsonb := '{}'::jsonb;
  m_students   jsonb := '{}'::jsonb;
  m_phones     jsonb := '{}'::jsonb;
  m_pairs      jsonb := '{}'::jsonb;
  s_parents    jsonb := '{}'::jsonb;
  s_students   jsonb := '{}'::jsonb;
  n_new_p      integer := 0;
  n_new_s      integer := 0;
  n_old_s      integer := 0;
  n_skipped    integer := 0;
begin
  perform public.assert_manager();

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Trung tâm: Dữ liệu nhập không hợp lệ. Hãy chọn lại file CSV.';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Trung tâm: File không có dòng dữ liệu nào để nhập.';
  end if;
  if v_total > c_max_rows then
    raise exception 'Trung tâm: Mỗi lần chỉ nhập tối đa % dòng (file hiện có % dòng). Hãy chia nhỏ file.', c_max_rows, v_total;
  end if;

  -- Bước 1: kiểm tra từng dòng, KHÔNG ghi dữ liệu
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_idx    := v_idx + 1;
    v_row_ok := true;
    v_line   := case when (v_item->>'line') ~ '^[0-9]{1,9}$' then (v_item->>'line')::integer else v_idx + 1 end;
    v_sname  := regexp_replace(btrim(coalesce(v_item->>'student_name', '')), '\s+', ' ', 'g');
    v_sphone := btrim(coalesce(v_item->>'student_phone', ''));
    v_pname  := regexp_replace(btrim(coalesce(v_item->>'parent_name', '')), '\s+', ' ', 'g');
    v_pphone := btrim(coalesce(v_item->>'parent_phone', ''));
    v_cname  := btrim(coalesce(v_item->>'class_name', ''));
    v_joined_txt := btrim(coalesce(v_item->>'joined_at', ''));

    if v_sname = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line, 'message', 'Thiếu họ tên học sinh.'));
      v_row_ok := false;
    end if;
    if v_pphone = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line, 'message', 'Thiếu SĐT phụ huynh.'));
      v_row_ok := false;
    elsif v_pphone !~ '^0[0-9]{9}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('SĐT phụ huynh "%s" chưa đúng (cần 10 chữ số, bắt đầu bằng 0).', v_pphone)));
      v_row_ok := false;
    end if;
    if v_sphone <> '' and v_sphone !~ '^0[0-9]{9}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('SĐT học sinh "%s" chưa đúng (cần 10 chữ số, bắt đầu bằng 0).', v_sphone)));
      v_row_ok := false;
    end if;

    v_joined  := v_today;
    v_date_ok := true;
    if v_joined_txt <> '' then
      if v_joined_txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_date_ok := false;
      else
        begin
          v_joined := v_joined_txt::date;
        exception when others then
          v_date_ok := false;
        end;
      end if;
      if not v_date_ok then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('Ngày vào lớp "%s" không hợp lệ (dùng DD/MM/YYYY).', v_joined_txt)));
        v_row_ok := false;
      elsif v_joined > v_today then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line, 'message', 'Ngày vào lớp không được ở tương lai.'));
        v_row_ok := false;
      elsif v_joined < date '2000-01-01' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', 'Ngày vào lớp quá xa (trước năm 2000), hãy kiểm tra lại.'));
        v_row_ok := false;
      end if;
    end if;

    if v_cname = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line, 'message', 'Thiếu tên lớp.'));
      v_row_ok := false;
    else
      select * into v_class from public.classes c where lower(c.name) = lower(v_cname) and c.deleted_at is null;
      if not found then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('Không tìm thấy lớp "%s" (hoặc lớp đã ẩn). Hãy tạo lớp trước khi nhập học sinh.', v_cname)));
        if not (v_missing @> to_jsonb(v_cname)) then
          v_missing := v_missing || jsonb_build_array(to_jsonb(v_cname));
        end if;
        v_row_ok := false;
      end if;
    end if;

    continue when not v_row_ok;

    -- Phụ huynh (nhận diện theo SĐT)
    v_pkey := v_pphone;
    if m_parents->v_pkey is null then
      select p.id, p.full_name into v_pid, v_exname from public.parents p where p.phone = v_pphone;
      if found then
        m_parents := m_parents || jsonb_build_object(v_pkey, jsonb_build_object('id', v_pid, 'name', v_exname, 'existing', true, 'line', v_line));
        if v_pname <> '' and public._import_norm_name(v_pname) <> public._import_norm_name(v_exname) then
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
            'message', format('SĐT phụ huynh %s đã có trong hệ thống với tên "%s", giữ nguyên tên này.', v_pphone, v_exname)));
        end if;
      else
        m_parents := m_parents || jsonb_build_object(v_pkey, jsonb_build_object('id', null, 'name', nullif(v_pname, ''), 'existing', false, 'line', v_line));
      end if;
    elsif v_pname <> '' and not (m_parents->v_pkey->>'existing')::boolean then
      if m_parents->v_pkey->>'name' is null then
        m_parents := jsonb_set(m_parents, array[v_pkey, 'name'], to_jsonb(v_pname));
      elsif public._import_norm_name(v_pname) <> public._import_norm_name(m_parents->v_pkey->>'name') then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('SĐT phụ huynh %s xuất hiện với tên khác, dùng tên "%s" ở dòng đầu tiên.', v_pphone, m_parents->v_pkey->>'name')));
      end if;
    end if;

    -- Học sinh (họ tên + SĐT phụ huynh)
    v_skey  := v_pphone || '|' || public._import_norm_name(v_sname);
    v_first := false;
    if m_students->v_skey is null then
      v_first   := true;
      v_pid     := (m_parents->v_pkey->>'id')::uuid;
      v_sid     := null;
      v_exphone := null;
      v_grades  := '[]'::jsonb;
      if v_pid is not null then
        select count(*), min(s.id::text)::uuid, min(s.phone) into v_cnt, v_sid, v_exphone
        from public.students s
        where s.parent_id = v_pid and public._import_norm_name(s.full_name) = public._import_norm_name(v_sname);
        if v_cnt > 1 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
            'message', format('Phụ huynh %s có nhiều học sinh trùng tên "%s", không xác định được em nào. Hãy xử lý trực tiếp trên web.', v_pphone, v_sname)));
          continue;
        end if;
        if v_sid is not null then
          select coalesce(jsonb_agg(distinct c.grade), '[]'::jsonb) into v_grades
          from public.class_enrollments e join public.classes c on c.id = e.class_id
          where e.student_id = v_sid and e.status = 'active';
        end if;
      end if;
      m_students := m_students || jsonb_build_object(v_skey, jsonb_build_object(
        'id', v_sid, 'name', v_sname, 'phone', v_exphone, 'existing', v_sid is not null, 'grades', v_grades, 'line', v_line));
    end if;

    v_student := m_students->v_skey;
    v_sid     := (v_student->>'id')::uuid;

    if v_sphone <> '' then
      if m_phones->>v_sphone is not null and m_phones->>v_sphone <> v_skey then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('SĐT học sinh %s trùng với một học sinh khác trong file.', v_sphone)));
        continue;
      end if;
      if exists (select 1 from public.students s where s.phone = v_sphone and (v_sid is null or s.id <> v_sid)) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('SĐT học sinh %s đã thuộc về một học sinh khác trong hệ thống.', v_sphone)));
        continue;
      end if;
      m_phones := m_phones || jsonb_build_object(v_sphone, v_skey);
      if (v_student->>'existing')::boolean then
        if v_first and v_student->>'phone' is distinct from v_sphone then
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
            'message', 'Học sinh đã có hồ sơ, giữ nguyên SĐT học sinh hiện có.'));
        end if;
      elsif v_student->>'phone' is null then
        m_students := jsonb_set(m_students, array[v_skey, 'phone'], to_jsonb(v_sphone));
      end if;
    end if;

    if v_sid is not null and exists (
      select 1 from public.class_enrollments e where e.student_id = v_sid and e.class_id = v_class.id and e.status = 'active'
    ) then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('%s đã đang học lớp %s, bỏ qua dòng này.', v_sname, v_class.name)));
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if m_pairs->(v_skey || '|' || v_class.id::text) is not null then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('Dòng trùng (cùng học sinh và cùng lớp %s), bỏ qua dòng này.', v_class.name)));
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from jsonb_array_elements(m_students->v_skey->'grades') g where (g #>> '{}')::integer <> v_class.grade
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('%s đang/được xếp vào lớp khối khác, không thể thêm vào lớp %s (khối %s). Trung tâm chỉ xếp học sinh vào các lớp cùng khối.',
          v_sname, v_class.name, v_class.grade)));
      continue;
    end if;
    if not ((m_students->v_skey->'grades') @> to_jsonb(v_class.grade)) then
      m_students := jsonb_set(m_students, array[v_skey, 'grades'], (m_students->v_skey->'grades') || to_jsonb(v_class.grade));
    end if;

    m_pairs := m_pairs || jsonb_build_object(v_skey || '|' || v_class.id::text, true);
    v_plan  := v_plan || jsonb_build_array(jsonb_build_object(
      'line', v_line, 'pkey', v_pkey, 'skey', v_skey, 'class_id', v_class.id, 'joined_at', v_joined));
  end loop;

  for v_pkey in select jsonb_object_keys(m_parents) loop
    if not (m_parents->v_pkey->>'existing')::boolean and m_parents->v_pkey->>'name' is null then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', (m_parents->v_pkey->>'line')::integer,
        'message', format('Chưa có tên phụ huynh (SĐT %s): Trung tâm dùng tên tạm "%s", hãy bổ sung sau trong hồ sơ học sinh.', v_pkey, c_temp_name)));
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_plan) loop
    v_pkey := v_item->>'pkey';
    v_skey := v_item->>'skey';
    if s_parents->v_pkey is null then
      s_parents := s_parents || jsonb_build_object(v_pkey, true);
      if not (m_parents->v_pkey->>'existing')::boolean then
        n_new_p := n_new_p + 1;
      end if;
    end if;
    if s_students->v_skey is null then
      s_students := s_students || jsonb_build_object(v_skey, true);
      if (m_students->v_skey->>'existing')::boolean then
        n_old_s := n_old_s + 1;
      else
        n_new_s := n_new_s + 1;
      end if;
    end if;
  end loop;

  -- Bước 2: ghi (chỉ khi không còn lỗi và không phải chạy kiểm tra)
  if jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true) then
    for v_item in select value from jsonb_array_elements(v_plan) loop
      v_pkey   := v_item->>'pkey';
      v_skey   := v_item->>'skey';
      v_parent := m_parents->v_pkey;
      v_pid    := (v_parent->>'id')::uuid;
      if v_pid is null then
        insert into public.parents (full_name, phone) values (coalesce(nullif(v_parent->>'name', ''), c_temp_name), v_pkey)
        returning id into v_pid;
        m_parents := jsonb_set(m_parents, array[v_pkey, 'id'], to_jsonb(v_pid));
      end if;
      v_student := m_students->v_skey;
      v_sid     := (v_student->>'id')::uuid;
      if v_sid is null then
        insert into public.students (full_name, phone, parent_id) values (v_student->>'name', nullif(v_student->>'phone', ''), v_pid)
        returning id into v_sid;
        m_students := jsonb_set(m_students, array[v_skey, 'id'], to_jsonb(v_sid));
      end if;
      insert into public.class_enrollments (class_id, student_id, joined_at)
      values ((v_item->>'class_id')::uuid, v_sid, (v_item->>'joined_at')::date);
    end loop;
  end if;

  return jsonb_build_object(
    'dry_run', coalesce(p_dry_run, true),
    'ok', jsonb_array_length(v_errors) = 0,
    'applied', jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true),
    'total_rows', v_total, 'errors', v_errors, 'warnings', v_warnings, 'missing_classes', v_missing,
    'summary', jsonb_build_object('new_parents', n_new_p, 'new_students', n_new_s, 'existing_students', n_old_s,
                                  'enrollments', jsonb_array_length(v_plan), 'skipped', n_skipped)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Chuyển năm học (một giao dịch)
--    * Lớp khối 5, 9, 12: học sinh hoàn thành (left_reason = 'graduated', ngày nghỉ = ngày chuyển - 1),
--      lớp được ẩn, giữ tên.
--    * Lớp khác: lên 1 khối (xử lý từ khối cao xuống thấp nên STT không đụng nhau); tên tự đổi theo khối.
--    * Kiểm tra "cùng khối" (trigger hoãn) chạy ngay ở cuối; sai thì hủy toàn bộ.
--    * p_dry_run = true chạy thật rồi hoàn tác nên bản xem trước luôn khớp bản chạy thật.
-- ---------------------------------------------------------------------
create or replace function public._rollover_apply(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_closing  constant integer[] := array[5, 9, 12];
  v_class    public.classes%rowtype;
  v_enr      record;
  v_closed   jsonb   := '[]'::jsonb;
  v_promoted jsonb   := '[]'::jsonb;
  v_dropped  integer := 0;
  v_count    integer;
  v_new      text;
begin
  perform set_config('sciencehub.class_change_date',   p_date::text,    true);
  perform set_config('sciencehub.class_change_reason', 'year_rollover', true);

  for v_class in
    select * from public.classes where deleted_at is null and grade = any (c_closing) order by grade, name
  loop
    v_count := 0;
    for v_enr in
      select e.id, e.joined_at from public.class_enrollments e
      where e.class_id = v_class.id and e.status = 'active' order by e.id
    loop
      perform public._drop_enrollment_core(v_enr.id, greatest(p_date - 1, v_enr.joined_at), false, 'graduated');
      v_count := v_count + 1;
    end loop;
    update public.classes set deleted_at = now() where id = v_class.id;
    v_dropped := v_dropped + v_count;
    v_closed := v_closed || jsonb_build_object('class_id', v_class.id, 'name', v_class.name, 'grade', v_class.grade, 'students', v_count);
  end loop;

  for v_class in
    select * from public.classes where deleted_at is null and not (grade = any (c_closing)) order by grade desc, name
  loop
    update public.classes set grade = grade + 1 where id = v_class.id returning name into v_new;
    v_promoted := v_promoted || jsonb_build_object(
      'class_id', v_class.id, 'old_name', v_class.name, 'new_name', v_new,
      'old_grade', v_class.grade, 'new_grade', v_class.grade + 1);
  end loop;

  -- Lấy tên mới sau khi cả loạt lớp đã đổi khối (tên có thể còn đổi khi lớp khác cùng môn đổi).
  select coalesce(jsonb_agg(p || jsonb_build_object('new_name', c.name) order by (p->>'old_grade')::integer desc, p->>'old_name'), '[]'::jsonb)
    into v_promoted
  from jsonb_array_elements(v_promoted) p
  join public.classes c on c.id = (p->>'class_id')::uuid;

  set constraints all immediate;

  perform public._write_audit_log(
    'school_year_rollover', 'school_year', null, null, null,
    format('Quản lý chuyển năm học từ ngày %s: %s lớp lên khối, %s lớp cuối cấp được đóng, %s học sinh hoàn thành lớp cuối cấp.',
           public._fmt_date(p_date), jsonb_array_length(v_promoted), jsonb_array_length(v_closed), v_dropped),
    null,
    jsonb_build_object('rollover_date', p_date, 'promoted_count', jsonb_array_length(v_promoted),
                       'closed_count', jsonb_array_length(v_closed), 'graduated_students', v_dropped));

  perform set_config('sciencehub.class_change_date',   '', true);
  perform set_config('sciencehub.class_change_reason', '', true);

  return jsonb_build_object('promoted', v_promoted, 'closed', v_closed, 'students_dropped', v_dropped);
end;
$$;

create or replace function public.rollover_school_year(
  p_date         date,
  p_dry_run      boolean default true,
  p_confirm_text text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_closing  constant integer[] := array[5, 9, 12];
  v_dry      boolean := coalesce(p_dry_run, true);
  v_errors   jsonb   := '[]'::jsonb;
  v_warnings jsonb   := '[]'::jsonb;
  v_result   jsonb;
  v_msg      text;
  v_last_run timestamptz;
  r          record;
begin
  perform public.assert_manager();
  if p_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày chuyển năm học.';
  end if;
  if p_date > public.vn_today() then
    raise exception 'Trung tâm: Ngày chuyển năm học không được ở tương lai.';
  end if;
  if not v_dry and btrim(coalesce(p_confirm_text, '')) <> 'CHUYEN NAM HOC' then
    raise exception 'Trung tâm: Vui lòng nhập đúng cụm từ xác nhận "CHUYEN NAM HOC".';
  end if;

  if not exists (select 1 from public.classes where deleted_at is null) then
    v_errors := v_errors || to_jsonb('Không có lớp nào đang hiển thị để chuyển.'::text);
  end if;

  for r in
    select c.name, count(*) as n, max(a.attendance_date) as last_date
    from public.classes c join public.attendance_records a on a.class_id = c.id
    where c.deleted_at is null and a.attendance_date >= p_date
    group by c.id, c.name order by c.name
  loop
    v_errors := v_errors || to_jsonb(format(
      'Lớp %s đã có %s buổi điểm danh từ ngày %s (gần nhất %s). Hãy chọn ngày chuyển sau buổi học cuối của năm học cũ.',
      r.name, r.n, public._fmt_date(p_date), public._fmt_date(r.last_date)));
  end loop;

  for r in
    select c.name, count(*) as n, max(a.attendance_date) as last_date
    from public.attendance_records a
    join public.class_enrollments e on e.id = a.enrollment_id and e.status = 'active'
    join public.classes c on c.id = e.class_id
    where c.deleted_at is null and c.grade = any (c_closing) and a.class_id <> e.class_id and a.attendance_date >= p_date
    group by c.id, c.name order by c.name
  loop
    v_errors := v_errors || to_jsonb(format(
      'Học sinh lớp %s có %s buổi học bù từ ngày %s (gần nhất %s). Hãy chọn ngày chuyển sau buổi học cuối của năm học cũ.',
      r.name, r.n, public._fmt_date(p_date), public._fmt_date(r.last_date)));
  end loop;

  select max(l.created_at) into v_last_run
  from public.audit_log l
  where l.action = 'school_year_rollover' and l.created_at > now() - interval '200 days';
  if v_last_run is not null then
    v_warnings := v_warnings || to_jsonb(format(
      'Trung tâm đã chuyển năm học lần gần nhất vào ngày %s. Hãy chắc chắn không chạy hai lần trong cùng một năm học.',
      to_char(v_last_run at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')));
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('dry_run', v_dry, 'ok', false, 'applied', false, 'date', p_date,
      'promoted', '[]'::jsonb, 'closed', '[]'::jsonb, 'students_dropped', 0, 'warnings', v_warnings, 'errors', v_errors);
  end if;

  if v_dry then
    begin
      v_result := public._rollover_apply(p_date);
      raise exception '%', v_result::text using errcode = 'SH001';
    exception
      when sqlstate 'SH001' then
        get stacked diagnostics v_msg = message_text;
        v_result := v_msg::jsonb;
      when others then
        get stacked diagnostics v_msg = message_text;
        return jsonb_build_object('dry_run', true, 'ok', false, 'applied', false, 'date', p_date,
          'promoted', '[]'::jsonb, 'closed', '[]'::jsonb, 'students_dropped', 0,
          'warnings', v_warnings, 'errors', jsonb_build_array(v_msg));
    end;
  else
    v_result := public._rollover_apply(p_date);
  end if;

  return jsonb_build_object('dry_run', v_dry, 'ok', true, 'applied', not v_dry, 'date', p_date,
    'promoted', v_result->'promoted', 'closed', v_result->'closed',
    'students_dropped', (v_result->>'students_dropped')::integer, 'warnings', v_warnings, 'errors', '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Khôi phục từ file sao lưu (.json) - nhận file V3 và file V2 (chuyển dữ liệu sang project mới)
--    * Thay thế hoàn toàn: teachers, parents, students, classes, class_schedules, class_enrollments,
--      attendance_records, class_versions, month_closures theo nội dung file.
--    * GIỮ NGUYÊN: tài khoản Quản lý và toàn bộ nhật ký (nhật ký trong file KHÔNG nạp lại; ghi thêm 1 dòng).
--    * Tài khoản Giáo viên trong file được nối theo EMAIL với user đang có trong Authentication.
--    * Chèn theo các cột có trong file (cột mới của V3 nhận giá trị mặc định); file V2 được bổ sung
--      lý do nghỉ (đổi lớp/nghỉ hẳn); tên lớp tính lại theo quy tắc V3.
--    * Một giao dịch; xem trước chạy thật rồi hoàn tác. Trigger nghiệp vụ bỏ qua bằng cờ _is_restoring
--      (không ALTER TABLE nên không khóa bảng). Bộ đếm mã HS/PH không lùi.
-- ---------------------------------------------------------------------
create or replace function public.restore_stage_chunk(p_run_id uuid, p_table text, p_chunk integer, p_rows jsonb)
returns void
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
       '_metadata', 'teachers', 'parents', 'students', 'classes', 'class_schedules', 'class_enrollments',
       'attendance_records', 'class_versions', 'month_closures', 'profiles'])) then
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

-- Chèn dữ liệu một bảng từ bảng tạm, chỉ với các cột có trong file (cột thiếu nhận DEFAULT).
create or replace function public._restore_insert_table(p_run_id uuid, p_table text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols  text;
  v_count integer := 0;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_table
    and exists (
      select 1 from public.restore_staging s cross join lateral jsonb_array_elements(s.rows) e
      where s.run_id = p_run_id and s.table_name = p_table and e ? c.column_name
    );
  if v_cols is null then
    return 0;
  end if;
  execute format(
    'insert into public.%1$I (%2$s) select %3$s from public.restore_staging s '
    'cross join lateral jsonb_populate_recordset(null::public.%1$I, s.rows) r '
    'where s.run_id = $1 and s.table_name = $2',
    p_table, v_cols, regexp_replace(v_cols, '(^|, )', '\1r.', 'g')
  ) using p_run_id, p_table;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public._restore_apply(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_insert   constant text[] := array[
    'teachers', 'parents', 'students', 'classes', 'class_schedules', 'class_enrollments',
    'attendance_records', 'class_versions', 'month_closures'
  ];
  t          text;
  v_meta     jsonb;
  v_v2       boolean;
  v_expected integer;
  v_actual   integer;
  v_warnings jsonb := '[]'::jsonb;
  v_counts   jsonb := '{}'::jsonb;
  v_renamed  jsonb;
  v_old_names jsonb;
  v_prof_all integer := 0;
  v_prof_ok  integer := 0;
  v_mixed    integer;
  v_last     bigint;
  v_called   boolean;
  v_max      bigint;
  r          record;
begin
  select s.rows into v_meta from public.restore_staging s
  where s.run_id = p_run_id and s.table_name = '_metadata' and s.chunk_no = 0;
  v_v2 := coalesce(v_meta->>'version', '') !~ '^V3';

  perform set_config('sciencehub.restoring', 'on', true);

  -- File V2: bổ sung lý do nghỉ. Có ghi danh khác của cùng học sinh bắt đầu đúng ngày nghỉ => đổi lớp.
  if v_v2 then
    with allrows as (
      select e from public.restore_staging s cross join lateral jsonb_array_elements(s.rows) e
      where s.run_id = p_run_id and s.table_name = 'class_enrollments'
    )
    update public.restore_staging s
    set rows = (
      select coalesce(jsonb_agg(
               case when x.e->>'status' = 'dropped' and coalesce(x.e->>'left_reason', '') = '' then
                 x.e || jsonb_build_object(
                   'left_reason', case when nxt.id is not null then 'transferred' else 'dropped' end,
                   'transfer_to_id', nxt.id)
               else x.e end
               order by x.ord), '[]'::jsonb)
      from jsonb_array_elements(s.rows) with ordinality x(e, ord)
      left join lateral (
        select a.e->>'id' as id from allrows a
        where a.e->>'student_id' = x.e->>'student_id' and a.e->>'joined_at' = x.e->>'left_at'
          and a.e->>'id' <> x.e->>'id'
        limit 1
      ) nxt on true
    )
    where s.run_id = p_run_id and s.table_name = 'class_enrollments';
  end if;

  -- Xóa theo thứ tự ngược phụ thuộc.
  delete from public.attendance_records where true;
  delete from public.class_versions     where true;
  delete from public.class_schedules    where true;
  delete from public.profiles           where role = 'teacher';
  delete from public.class_enrollments  where true;
  delete from public.classes            where true;
  delete from public.students           where true;
  delete from public.parents            where true;
  delete from public.teachers           where true;
  delete from public.month_closures     where true;

  foreach t in array c_insert loop
    v_actual := public._restore_insert_table(p_run_id, t);
    select coalesce(sum(jsonb_array_length(s.rows)), 0)::integer into v_expected
    from public.restore_staging s where s.run_id = p_run_id and s.table_name = t;
    if v_actual <> v_expected then
      raise exception 'Trung tâm: Số dòng bảng % sau khi khôi phục (%) khác số dòng trong file (%). Toàn bộ thay đổi đã được hủy.',
        t, v_actual, v_expected;
    end if;
    v_counts := v_counts || jsonb_build_object(t, v_actual);
  end loop;

  -- Tài khoản Giáo viên: nối theo email với user hiện có trong Authentication.
  select count(*) into v_prof_all
  from public.restore_staging s cross join lateral jsonb_array_elements(s.rows) p
  where s.run_id = p_run_id and s.table_name = 'profiles' and p->>'role' = 'teacher';

  insert into public.profiles (user_id, role, teacher_id, active, created_at)
  select distinct on (u.id) u.id, 'teacher', (p->>'teacher_id')::uuid, coalesce((p->>'active')::boolean, false),
         coalesce((p->>'created_at')::timestamptz, now())
  from public.restore_staging s
  cross join lateral jsonb_array_elements(s.rows) p
  join auth.users u on lower(u.email) = lower(p->>'email')
  where s.run_id = p_run_id and s.table_name = 'profiles' and p->>'role' = 'teacher'
    and exists (select 1 from public.teachers th where th.id = (p->>'teacher_id')::uuid)
    and not exists (select 1 from public.profiles pr where pr.user_id = u.id)
  on conflict do nothing;
  get diagnostics v_prof_ok = row_count;

  if v_prof_all > v_prof_ok then
    v_warnings := v_warnings || to_jsonb(format(
      '%s tài khoản giáo viên trong file chưa được nối vì chưa có user cùng email trong Supabase Authentication (hoặc email đang là Quản lý). Hãy tạo user rồi liên kết lại ở trang Giáo viên.',
      v_prof_all - v_prof_ok));
  end if;

  -- Tên lớp tính lại theo quy tắc V3 (so với tên trong file để báo trước).
  select coalesce(jsonb_object_agg(id::text, name), '{}'::jsonb) into v_old_names from public.classes;
  perform public._refresh_class_names(null);
  select coalesce(jsonb_agg(jsonb_build_object('old_name', v_old_names->>c.id::text, 'new_name', c.name)
                            order by v_old_names->>c.id::text), '[]'::jsonb)
    into v_renamed
  from public.classes c
  where (v_old_names->>c.id::text) is distinct from c.name;

  -- Trạng thái suy ra (học sinh/phụ huynh ẩn hiện, khối) tính lại từ dữ liệu gốc.
  for r in select id from public.students loop
    perform public._sync_student_state(r.id);
  end loop;
  for r in select id from public.parents loop
    perform public._sync_parent_state(r.id);
  end loop;

  select count(*) into v_mixed from (
    select e.student_id from public.class_enrollments e join public.classes c on c.id = e.class_id
    where e.status = 'active' group by e.student_id having count(distinct c.grade) > 1
  ) x;
  if v_mixed > 0 then
    v_warnings := v_warnings || to_jsonb(format(
      '%s học sinh trong file đang học các lớp khác khối. Hệ thống giữ nguyên dữ liệu như file; hãy cho nghỉ hoặc đổi lớp các em này.', v_mixed));
  end if;

  select last_value, is_called into v_last, v_called from public.student_code_seq;
  select coalesce(max(substring(student_code from 3)::bigint), 0) into v_max from public.students where student_code ~ '^HS[0-9]+$';
  perform setval('public.student_code_seq', greatest(case when v_called then v_last else 0 end, v_max, 1), true);
  select last_value, is_called into v_last, v_called from public.parent_code_seq;
  select coalesce(max(substring(parent_code from 3)::bigint), 0) into v_max from public.parents where parent_code ~ '^PH[0-9]+$';
  perform setval('public.parent_code_seq', greatest(case when v_called then v_last else 0 end, v_max, 1), true);

  perform set_config('sciencehub.restoring', '', true);

  perform public._write_audit_log(
    'center_restore', 'center_backup', null, null, null,
    case when v_v2
      then format('Chuyển dữ liệu từ hệ thống cũ (%s, xuất lúc %s): %s học sinh, %s lớp, %s buổi điểm danh.',
                  coalesce(v_meta->>'version', 'V2'), coalesce(v_meta->>'exported_at', 'không rõ'),
                  v_counts->>'students', v_counts->>'classes', v_counts->>'attendance_records')
      else format('Quản lý khôi phục dữ liệu từ file sao lưu xuất lúc %s: %s học sinh, %s lớp, %s buổi điểm danh.',
                  coalesce(v_meta->>'exported_at', 'không rõ'),
                  v_counts->>'students', v_counts->>'classes', v_counts->>'attendance_records')
    end,
    null,
    jsonb_build_object('file_version', v_meta->>'version', 'file_exported_at', v_meta->>'exported_at',
                       'counts', v_counts, 'renamed_classes', jsonb_array_length(v_renamed)));

  delete from public.restore_staging where run_id = p_run_id;

  return jsonb_build_object('warnings', v_warnings, 'counts', v_counts, 'renamed', v_renamed);
end;
$$;

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
    'teachers', 'parents', 'students', 'classes', 'class_schedules', 'class_enrollments', 'attendance_records'
  ];
  c_optional constant text[] := array['class_versions', 'month_closures', 'profiles'];
  c_diff     constant text[] := array[
    'teachers', 'parents', 'students', 'classes', 'class_schedules', 'class_enrollments',
    'attendance_records', 'class_versions', 'month_closures'
  ];
  v_dry      boolean := coalesce(p_dry_run, true);
  v_meta     jsonb;
  v_file     jsonb;
  v_errors   jsonb := '[]'::jsonb;
  v_tables   jsonb := '[]'::jsonb;
  v_result   jsonb;
  v_msg      text;
  t          text;
  v_chunks   integer;
  v_maxchunk integer;
  v_rows     integer;
  v_declared integer;
  v_filecnt  integer;
  v_cur      integer;
  v_in_file  integer;
  v_added    integer;
  v_removed  integer;
  v_bad      text;
begin
  perform public.assert_manager();
  if p_run_id is null then
    raise exception 'Trung tâm: Thiếu mã lần khôi phục. Hãy chọn lại file sao lưu.';
  end if;
  if not v_dry and btrim(coalesce(p_confirm_text, '')) <> 'KHOI PHUC' then
    raise exception 'Trung tâm: Vui lòng nhập đúng cụm từ xác nhận "KHOI PHUC".';
  end if;

  select s.rows into v_meta from public.restore_staging s
  where s.run_id = p_run_id and s.table_name = '_metadata' and s.chunk_no = 0 and s.created_by is not distinct from auth.uid();
  if v_meta is null then
    raise exception 'Trung tâm: Không tìm thấy dữ liệu file sao lưu đã tải lên (có thể đã hết hạn). Hãy chọn lại file và xem trước.';
  end if;
  v_file := jsonb_build_object('center', v_meta->>'center', 'version', v_meta->>'version', 'exported_at', v_meta->>'exported_at');

  if coalesce(v_meta->>'center', '') <> 'Trung tâm ScienceHub' then
    v_errors := v_errors || to_jsonb('File này không phải bản sao lưu của Trung tâm ScienceHub.'::text);
  end if;

  foreach t in array c_required || c_optional loop
    select count(*), coalesce(max(s.chunk_no), -1), coalesce(sum(jsonb_array_length(s.rows)), 0)::integer
      into v_chunks, v_maxchunk, v_rows
    from public.restore_staging s where s.run_id = p_run_id and s.table_name = t;
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
      v_errors := v_errors || to_jsonb(format('Số dòng bảng "%s" tải lên (%s) không khớp số dòng đã gửi (%s). Hãy chọn lại file.',
        t, v_rows, coalesce(v_declared::text, 'không rõ')));
    end if;
    v_filecnt := nullif(v_meta->'file_counts'->>t, '')::integer;
    if v_filecnt is not null and v_filecnt <> v_rows then
      v_errors := v_errors || to_jsonb(format('File sao lưu có thể bị cắt hoặc hỏng: bảng "%s" khai báo %s dòng nhưng chỉ có %s dòng.',
        t, v_filecnt, v_rows));
    end if;
  end loop;

  -- Lớp thiếu môn/khối/STT/giáo viên (chỉ có ở dữ liệu cũ): V3 bắt buộc đủ để tự đặt tên lớp.
  select string_agg(coalesce(c->>'name', '?'), ', ' order by c->>'name') into v_bad
  from public.restore_staging s cross join lateral jsonb_array_elements(s.rows) c
  where s.run_id = p_run_id and s.table_name = 'classes'
    and (coalesce(btrim(c->>'subject'), '') = '' or c->>'grade' is null or c->>'class_no' is null or c->>'teacher_id' is null);
  if v_bad is not null then
    v_errors := v_errors || to_jsonb(format(
      'Các lớp sau thiếu môn, khối, STT hoặc giáo viên nên chưa chuyển được: %s. Hãy bấm Sửa lớp trên hệ thống cũ, tải lại file sao lưu rồi thử lại.', v_bad));
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('dry_run', v_dry, 'ok', false, 'applied', false, 'file', v_file,
                              'tables', '[]'::jsonb, 'renamed', '[]'::jsonb, 'warnings', '[]'::jsonb, 'errors', v_errors);
  end if;

  foreach t in array c_diff loop
    execute format(
      'with f as (select e->>%2$L as k from public.restore_staging s '
      '  cross join lateral jsonb_array_elements(s.rows) e where s.run_id = $1 and s.table_name = $2), '
      'cur as (select %3$I::text as k from public.%1$I) '
      'select (select count(*) from cur), (select count(*) from f), '
      '       (select count(*) from (select k from f except select k from cur) a), '
      '       (select count(*) from (select k from cur except select k from f) b)',
      t,
      case when t = 'month_closures' then 'month_start' else 'id' end,
      case when t = 'month_closures' then 'month_start' else 'id' end
    ) into v_cur, v_in_file, v_added, v_removed using p_run_id, t;
    v_tables := v_tables || jsonb_build_object('name', t, 'current', v_cur, 'in_file', v_in_file,
                                               'added', v_added, 'removed', v_removed);
  end loop;

  if v_dry then
    begin
      v_result := public._restore_apply(p_run_id);
      raise exception '%', v_result::text using errcode = 'SH002';
    exception
      when sqlstate 'SH002' then
        get stacked diagnostics v_msg = message_text;
        v_result := v_msg::jsonb;
      when others then
        get stacked diagnostics v_msg = message_text;
        return jsonb_build_object('dry_run', true, 'ok', false, 'applied', false, 'file', v_file,
                                  'tables', v_tables, 'renamed', '[]'::jsonb, 'warnings', '[]'::jsonb,
                                  'errors', jsonb_build_array(v_msg));
    end;
  else
    v_result := public._restore_apply(p_run_id);
  end if;

  return jsonb_build_object('dry_run', v_dry, 'ok', true, 'applied', not v_dry, 'file', v_file,
                            'tables', v_tables, 'renamed', v_result->'renamed',
                            'warnings', v_result->'warnings', 'errors', '[]'::jsonb);
end;
$$;
