-- =====================================================================
-- Trung tâm ScienceHub - FILE 07: V2-4 SAO LƯU DỮ LIỆU THỦ CÔNG (JSON/CSV)
-- Chạy SAU 06_v2_3_audit_log.sql. An toàn khi chạy lại nhiều lần.
-- KHÔNG chạy lại 03_rpc_and_auth.sql.
--
-- Nội dung (chỉ Quản lý gọi được, đặt assert_manager() ở dòng đầu):
--   1. export_center_backup(p_include_audit_log, p_tables): xuất dữ liệu các bảng nghiệp vụ.
--      Có thể chọn bảng (p_tables) để xuất CSV Học sinh / Lớp học mà không kéo cả điểm danh.
--   2. export_monthly_attendance_report(p_year, p_month): bảng điểm danh và học phí theo tháng,
--      cộng tuyệt đối từ attendance_records.price_snapshot (đơn giá đóng băng).
--   Mỗi lần xuất đều ghi 1 dòng nhật ký 'backup_export' (ai xuất, lúc nào, gồm bảng nào),
--   vì file xuất chứa toàn bộ dữ liệu cá nhân của học sinh và phụ huynh.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Xuất dữ liệu các bảng ra JSON
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
    'parents', 'teachers', 'students', 'classes', 'class_schedules',
    'class_enrollments', 'attendance_records', 'profiles', 'audit_log'
  ];
  v_want   text[];
  v_name   text;
  v_data   jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
begin
  perform public.assert_manager();

  if p_tables is null then
    v_want := c_all;
  else
    v_want := p_tables;
    foreach v_name in array v_want loop
      if not (v_name = any (c_all)) then
        raise exception 'Trung tâm: Bảng "%" không nằm trong danh sách được phép sao lưu.', v_name;
      end if;
    end loop;
  end if;

  if not coalesce(p_include_audit_log, true) then
    v_want := array_remove(v_want, 'audit_log');
  end if;

  foreach v_name in array c_all loop
    continue when not (v_name = any (v_want));

    v_data := case v_name
      when 'parents' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.parent_code), '[]'::jsonb)
        from public.parents x)
      when 'teachers' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.full_name, x.id), '[]'::jsonb)
        from public.teachers x)
      when 'students' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.student_code), '[]'::jsonb)
        from public.students x)
      when 'classes' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.name, x.id), '[]'::jsonb)
        from public.classes x)
      when 'class_schedules' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.class_id, x.day_of_week), '[]'::jsonb)
        from public.class_schedules x)
      when 'class_enrollments' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.joined_at desc, x.created_at desc, x.id), '[]'::jsonb)
        from public.class_enrollments x)
      when 'attendance_records' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.attendance_date desc, x.created_at desc, x.id), '[]'::jsonb)
        from public.attendance_records x)
      when 'profiles' then (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'user_id',    pr.user_id,
              'email',      u.email,
              'role',       pr.role,
              'teacher_id', pr.teacher_id,
              'active',     pr.active,
              'created_at', pr.created_at
            )
            order by pr.role, pr.created_at, pr.user_id
          ),
          '[]'::jsonb)
        from public.profiles pr
        left join auth.users u on u.id = pr.user_id)
      else (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.created_at desc, x.id desc), '[]'::jsonb)
        from public.audit_log x)
    end;

    v_tables := v_tables || jsonb_build_object(v_name, v_data);
    v_counts := v_counts || jsonb_build_object(v_name, jsonb_array_length(v_data));
  end loop;

  -- Ghi nhật ký SAU khi đã đọc xong audit_log, để dòng này không lọt vào chính file vừa xuất.
  perform public._write_audit_log(
    'backup_export', 'backup', null, null, null,
    format('Quản lý xuất dữ liệu sao lưu (%s)', array_to_string(v_want, ', ')),
    null,
    jsonb_build_object('tables', to_jsonb(v_want), 'counts', v_counts)
  );

  return jsonb_build_object(
    'metadata', jsonb_build_object(
      'center',      'Trung tâm ScienceHub',
      'version',     'V2-4',
      'exported_at', now(),
      'vn_date',     public.vn_today(),
      'school_year', public.vn_school_year_bounds(),
      'counts',      v_counts
    ),
    'tables', v_tables
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Báo cáo điểm danh và học phí theo tháng
--    Mỗi dòng = 1 lượt ghi danh còn hiệu lực trong tháng. Buổi học bù được cộng về lớp GỐC
--    (điểm danh học bù mang enrollment_id của lớp gốc và đơn giá của lớp gốc).
-- ---------------------------------------------------------------------
create or replace function public.export_monthly_attendance_report(
  p_year  integer,
  p_month integer
) returns jsonb
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

  if p_year is null or p_month is null
     or p_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Trung tâm: Tháng hoặc năm xuất báo cáo không hợp lệ.';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_next  := (v_start + interval '1 month')::date;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_code',      x.student_code,
        'student_name',      x.student_name,
        'student_phone',     x.student_phone,
        'grade',             x.grade,
        'parent_code',       x.parent_code,
        'parent_name',       x.parent_name,
        'parent_phone',      x.parent_phone,
        'class_name',        x.class_name,
        'subject',           x.subject,
        'teacher_name',      x.teacher_name,
        'enrollment_status', x.enrollment_status,
        'joined_at',         x.joined_at,
        'left_at',           x.left_at,
        'present_count',     x.present_count,
        'makeup_count',      x.makeup_count,
        'absent_count',      x.absent_count,
        'excused_count',     x.excused_count,
        'charged_sessions',  x.charged_sessions,
        'total_tuition',     x.total_tuition
      )
      order by x.class_name, x.student_name, x.enrollment_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      e.id                                   as enrollment_id,
      s.student_code,
      s.full_name                            as student_name,
      coalesce(s.phone, '')                  as student_phone,
      coalesce(c.grade, s.grade)             as grade,
      coalesce(p.parent_code, '')            as parent_code,
      coalesce(p.full_name, '')              as parent_name,
      coalesce(p.phone, '')                  as parent_phone,
      c.name                                 as class_name,
      coalesce(c.subject, '')                as subject,
      coalesce(t.full_name, '')              as teacher_name,
      e.status                               as enrollment_status,
      e.joined_at,
      e.left_at,
      count(a.id) filter (where a.status = 'present' and a.class_id = e.class_id) as present_count,
      count(a.id) filter (where a.status = 'present' and a.class_id <> e.class_id) as makeup_count,
      count(a.id) filter (where a.status = 'absent')                              as absent_count,
      count(a.id) filter (where a.status = 'absent_excused')                      as excused_count,
      count(a.id) filter (where a.status in ('present', 'absent'))                as charged_sessions,
      coalesce(sum(a.price_snapshot) filter (where a.status in ('present', 'absent')), 0) as total_tuition
    from public.class_enrollments e
    join public.students s on s.id = e.student_id
    join public.classes c on c.id = e.class_id
    left join public.parents p on p.id = s.parent_id
    left join public.teachers t on t.id = c.teacher_id
    left join public.attendance_records a
      on a.enrollment_id = e.id
     and a.attendance_date >= v_start
     and a.attendance_date <  v_next
    where e.joined_at < v_next
      and (e.left_at is null or e.left_at >= v_start)
    group by
      e.id, e.status, e.joined_at, e.left_at, e.class_id,
      s.id, s.student_code, s.full_name, s.phone, s.grade,
      p.parent_code, p.full_name, p.phone,
      c.id, c.name, c.subject, c.grade,
      t.full_name
  ) x;

  perform public._write_audit_log(
    'backup_export', 'backup', null, null, null,
    format('Quản lý xuất báo cáo điểm danh và học phí tháng %s/%s', p_month, p_year),
    null,
    jsonb_build_object('year', p_year, 'month', p_month, 'rows', jsonb_array_length(v_rows))
  );

  return jsonb_build_object('year', p_year, 'month', p_month, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Chốt quyền EXECUTE
-- ---------------------------------------------------------------------
revoke execute on function public.export_center_backup(boolean, text[])               from anon, public;
revoke execute on function public.export_monthly_attendance_report(integer, integer)  from anon, public;

grant execute on function public.export_center_backup(boolean, text[])                to authenticated;
grant execute on function public.export_monthly_attendance_report(integer, integer)   to authenticated;

notify pgrst, 'reload schema';
