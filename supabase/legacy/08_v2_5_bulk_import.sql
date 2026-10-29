-- =====================================================================
-- Trung tâm ScienceHub - FILE 08: V2-5 NHẬP HỌC SINH HÀNG LOẠT TỪ FILE CSV
-- Chạy SAU 07_v2_4_backup.sql. An toàn khi chạy lại nhiều lần.
-- KHÔNG chạy lại 03_rpc_and_auth.sql.
--
-- Nội dung (chỉ Quản lý gọi được, đặt assert_manager() ở dòng đầu):
--   import_students_bulk(p_rows jsonb, p_dry_run boolean)
--     - p_dry_run = true : chỉ KIỂM TRA, không ghi gì (không tiêu hao mã HS/PH). Trả về lỗi/cảnh báo theo dòng.
--     - p_dry_run = false: kiểm tra lại toàn bộ rồi ghi trong 1 giao dịch. Còn bất kỳ lỗi nào thì không ghi gì.
--   Mỗi phần tử p_rows: {line, student_name, student_phone, parent_name, parent_phone, class_name, joined_at}
--     (joined_at dạng 'YYYY-MM-DD' hoặc rỗng = hôm nay).
--
-- Quy tắc đã chốt:
--   * Nhận diện học sinh = Họ tên (không phân biệt hoa/thường) + SĐT phụ huynh.
--   * Học sinh đã có: dùng lại hồ sơ, chỉ ghi danh thêm lớp. Đang học đúng lớp đó: cảnh báo, bỏ qua dòng.
--   * Phụ huynh nhận diện theo SĐT; trùng SĐT khác tên: giữ tên đang có và cảnh báo.
--   * Không có tên phụ huynh: dùng tên tạm '(Chưa cập nhật tên)', sửa sau ở hồ sơ học sinh.
--   * Lớp phải tồn tại sẵn và đang hiển thị (khớp tên lớp, không phân biệt hoa/thường).
--   * Các quy tắc cùng khối, ngày vào lớp không ở tương lai... vẫn do trigger của file 02 kiểm soát.
--   * Nhật ký thay đổi tự ghi qua các trigger của file 06 (từng học sinh, từng lượt ghi danh).
-- =====================================================================

-- Chuẩn hóa họ tên để so khớp: bỏ khoảng trắng thừa, không phân biệt hoa/thường (vẫn phân biệt dấu).
create or replace function public._import_norm_name(p_text text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

revoke execute on function public._import_norm_name(text) from anon, authenticated, public;

create or replace function public.import_students_bulk(
  p_rows    jsonb,
  p_dry_run boolean default true
) returns jsonb
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
  v_cgrade     integer;
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
  m_parents    jsonb := '{}'::jsonb;  -- SĐT phụ huynh -> {id, name, existing, line}
  m_students   jsonb := '{}'::jsonb;  -- SĐT phụ huynh|tên chuẩn hóa -> {id, name, phone, existing, grades, line}
  m_phones     jsonb := '{}'::jsonb;  -- SĐT học sinh -> khóa học sinh
  m_pairs      jsonb := '{}'::jsonb;  -- khóa học sinh|lớp -> true (chống trùng dòng trong file)
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

  -- ---------------------------------------------------------------
  -- Bước 1: kiểm tra từng dòng, KHÔNG ghi dữ liệu
  -- ---------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(p_rows)
  loop
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

    -- Ngày vào lớp
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
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', 'Ngày vào lớp không được ở tương lai.'));
        v_row_ok := false;
      elsif v_joined < date '2000-01-01' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', 'Ngày vào lớp quá xa (trước năm 2000), hãy kiểm tra lại.'));
        v_row_ok := false;
      end if;
    end if;

    -- Lớp phải có sẵn và đang hiển thị
    if v_cname = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line, 'message', 'Thiếu tên lớp.'));
      v_row_ok := false;
    else
      select * into v_class
      from public.classes c
      where lower(c.name) = lower(v_cname) and c.deleted_at is null;
      if not found then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('Không tìm thấy lớp "%s" (hoặc lớp đã ẩn). Hãy tạo lớp trước khi nhập học sinh.', v_cname)));
        if not (v_missing @> to_jsonb(v_cname)) then
          v_missing := v_missing || jsonb_build_array(to_jsonb(v_cname));
        end if;
        v_row_ok := false;
      end if;
    end if;

    if not v_row_ok then
      continue;
    end if;

    -- Phụ huynh (nhận diện theo SĐT)
    v_pkey := v_pphone;
    if m_parents->v_pkey is null then
      select p.id, p.full_name into v_pid, v_exname from public.parents p where p.phone = v_pphone;
      if found then
        m_parents := m_parents || jsonb_build_object(v_pkey,
          jsonb_build_object('id', v_pid, 'name', v_exname, 'existing', true, 'line', v_line));
        if v_pname <> '' and public._import_norm_name(v_pname) <> public._import_norm_name(v_exname) then
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
            'message', format('SĐT phụ huynh %s đã có trong hệ thống với tên "%s", giữ nguyên tên này.', v_pphone, v_exname)));
        end if;
      else
        m_parents := m_parents || jsonb_build_object(v_pkey,
          jsonb_build_object('id', null, 'name', nullif(v_pname, ''), 'existing', false, 'line', v_line));
      end if;
    elsif v_pname <> '' and not (m_parents->v_pkey->>'existing')::boolean then
      if m_parents->v_pkey->>'name' is null then
        m_parents := jsonb_set(m_parents, array[v_pkey, 'name'], to_jsonb(v_pname));
      elsif public._import_norm_name(v_pname) <> public._import_norm_name(m_parents->v_pkey->>'name') then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('SĐT phụ huynh %s xuất hiện với tên khác, dùng tên "%s" ở dòng đầu tiên.',
            v_pphone, m_parents->v_pkey->>'name')));
      end if;
    end if;

    -- Học sinh (nhận diện theo họ tên + SĐT phụ huynh)
    v_skey  := v_pphone || '|' || public._import_norm_name(v_sname);
    v_first := false;
    if m_students->v_skey is null then
      v_first := true;
      v_pid   := (m_parents->v_pkey->>'id')::uuid;
      v_sid   := null;
      v_exphone := null;
      v_grades  := '[]'::jsonb;
      if v_pid is not null then
        select count(*), min(s.id::text)::uuid, min(s.phone)
          into v_cnt, v_sid, v_exphone
        from public.students s
        where s.parent_id = v_pid
          and public._import_norm_name(s.full_name) = public._import_norm_name(v_sname);
        if v_cnt > 1 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
            'message', format('Phụ huynh %s có nhiều học sinh trùng tên "%s", không xác định được em nào. Hãy xử lý trực tiếp trên web.',
              v_pphone, v_sname)));
          continue;
        end if;
        if v_sid is not null then
          select coalesce(jsonb_agg(distinct x.g), '[]'::jsonb) into v_grades
          from (
            select public.class_effective_grade(e.class_id) as g
            from public.class_enrollments e
            where e.student_id = v_sid and e.status = 'active'
          ) x
          where x.g is not null;
        end if;
      end if;
      m_students := m_students || jsonb_build_object(v_skey,
        jsonb_build_object('id', v_sid, 'name', v_sname, 'phone', v_exphone,
                           'existing', v_sid is not null, 'grades', v_grades, 'line', v_line));
    end if;

    v_student := m_students->v_skey;
    v_sid     := (v_student->>'id')::uuid;

    -- SĐT học sinh (duy nhất trong hệ thống và trong file)
    if v_sphone <> '' then
      if m_phones->>v_sphone is not null and m_phones->>v_sphone <> v_skey then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
          'message', format('SĐT học sinh %s trùng với một học sinh khác trong file.', v_sphone)));
        continue;
      end if;
      if exists (
        select 1 from public.students s
        where s.phone = v_sphone and (v_sid is null or s.id <> v_sid)
      ) then
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

    -- Đã đang học đúng lớp này
    if v_sid is not null and exists (
      select 1 from public.class_enrollments e
      where e.student_id = v_sid and e.class_id = v_class.id and e.status = 'active'
    ) then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('%s đã đang học lớp %s, bỏ qua dòng này.', v_sname, v_class.name)));
      n_skipped := n_skipped + 1;
      continue;
    end if;

    -- Trùng dòng trong file (cùng học sinh, cùng lớp)
    if m_pairs->(v_skey || '|' || v_class.id::text) is not null then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('Dòng trùng (cùng học sinh và cùng lớp %s), bỏ qua dòng này.', v_class.name)));
      n_skipped := n_skipped + 1;
      continue;
    end if;

    -- Cùng khối: so với các lớp đang học và các lớp trước đó trong file
    v_cgrade := public.class_effective_grade(v_class.id);
    if v_cgrade is not null and exists (
      select 1 from jsonb_array_elements(m_students->v_skey->'grades') g
      where (g #>> '{}')::integer <> v_cgrade
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_line,
        'message', format('%s đang/được xếp vào lớp khối khác, không thể thêm vào lớp %s (khối %s). Trung tâm chỉ xếp học sinh vào các lớp cùng khối.',
          v_sname, v_class.name, v_cgrade)));
      continue;
    end if;
    if v_cgrade is not null and not ((m_students->v_skey->'grades') @> to_jsonb(v_cgrade)) then
      m_students := jsonb_set(m_students, array[v_skey, 'grades'], (m_students->v_skey->'grades') || to_jsonb(v_cgrade));
    end if;

    m_pairs := m_pairs || jsonb_build_object(v_skey || '|' || v_class.id::text, true);
    v_plan  := v_plan || jsonb_build_array(jsonb_build_object(
      'line', v_line, 'pkey', v_pkey, 'skey', v_skey,
      'class_id', v_class.id, 'joined_at', v_joined));
  end loop;

  -- Phụ huynh mới chưa có tên: báo trước sẽ dùng tên tạm
  for v_pkey in select jsonb_object_keys(m_parents)
  loop
    if not (m_parents->v_pkey->>'existing')::boolean and m_parents->v_pkey->>'name' is null then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'line', (m_parents->v_pkey->>'line')::integer,
        'message', format('Chưa có tên phụ huynh (SĐT %s): Trung tâm dùng tên tạm "%s", hãy bổ sung sau trong hồ sơ học sinh.',
          v_pkey, c_temp_name)));
    end if;
  end loop;

  -- Thống kê dự kiến
  for v_item in select value from jsonb_array_elements(v_plan)
  loop
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

  -- ---------------------------------------------------------------
  -- Bước 2: ghi dữ liệu (chỉ khi không còn lỗi và không phải chạy kiểm tra)
  -- ---------------------------------------------------------------
  if jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true) then
    for v_item in select value from jsonb_array_elements(v_plan)
    loop
      v_pkey   := v_item->>'pkey';
      v_skey   := v_item->>'skey';
      v_parent := m_parents->v_pkey;
      v_pid    := (v_parent->>'id')::uuid;

      if v_pid is null then
        insert into public.parents (full_name, phone)
        values (coalesce(nullif(v_parent->>'name', ''), c_temp_name), v_pkey)
        returning id into v_pid;
        m_parents := jsonb_set(m_parents, array[v_pkey, 'id'], to_jsonb(v_pid));
      end if;

      v_student := m_students->v_skey;
      v_sid     := (v_student->>'id')::uuid;
      if v_sid is null then
        insert into public.students (full_name, phone, parent_id)
        values (v_student->>'name', nullif(v_student->>'phone', ''), v_pid)
        returning id into v_sid;
        m_students := jsonb_set(m_students, array[v_skey, 'id'], to_jsonb(v_sid));
      end if;

      insert into public.class_enrollments (class_id, student_id, joined_at)
      values ((v_item->>'class_id')::uuid, v_sid, (v_item->>'joined_at')::date);
    end loop;
  end if;

  return jsonb_build_object(
    'dry_run',         coalesce(p_dry_run, true),
    'ok',              jsonb_array_length(v_errors) = 0,
    'applied',         jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true),
    'total_rows',      v_total,
    'errors',          v_errors,
    'warnings',        v_warnings,
    'missing_classes', v_missing,
    'summary', jsonb_build_object(
      'new_parents',       n_new_p,
      'new_students',      n_new_s,
      'existing_students', n_old_s,
      'enrollments',       jsonb_array_length(v_plan),
      'skipped',           n_skipped
    )
  );
end;
$$;

revoke execute on function public.import_students_bulk(jsonb, boolean) from anon, public;
grant  execute on function public.import_students_bulk(jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
