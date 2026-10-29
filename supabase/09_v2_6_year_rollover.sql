-- =====================================================================
-- Trung tâm ScienceHub - FILE 09: V2-6 CHUYỂN NĂM HỌC & LỊCH SỬ NHÃN LỚP
-- Chạy SAU 08_v2_5_bulk_import.sql. An toàn khi chạy lại nhiều lần.
-- KHÔNG chạy lại 02_triggers.sql và 03_rpc_and_auth.sql sau file này
-- (file 02 sẽ ghi đè bản nới của check_class_grade_change; file 03 ghi đè các RPC đã nâng cấp).
--
-- Nội dung:
--   1. Bảng class_versions: các thời kỳ ĐÃ ĐÓNG của nhãn lớp (tên, môn, khối, STT, giáo viên).
--      Chỉ thêm, không sửa, không xóa. Quản lý đọc tất cả; Giáo viên đọc lớp của mình.
--   2. Trigger trg_class_versions trên classes: tự lưu nhãn cũ mỗi khi đổi tên, môn, khối,
--      STT hoặc giáo viên. Điểm danh và học phí KHÔNG bị đụng tới.
--   3. class_label_on(class_id, date): nhãn của lớp tại một ngày (phiên bản cũ nếu có, không thì nhãn hiện tại).
--   4. check_class_grade_change: bản nới của hàm trong file 02, chỉ bỏ qua kiểm tra xung đột khối
--      giữa các lớp khi đang chạy rollover_school_year (cờ cục bộ giao dịch).
--   5. rollover_school_year(p_date, p_dry_run, p_confirm_text) - chỉ Quản lý, một giao dịch:
--        * Lớp khối 5, 9, 12 (cuối cấp): cho nghỉ toàn bộ học sinh rồi ẩn lớp (giữ nguyên tên).
--        * Các lớp khối còn lại: lên 1 khối, đổi tên theo Môn_Khối_TênGV_STT (xử lý từ khối cao xuống thấp).
--        * Kiểm tra cuối: không học sinh nào học hai lớp khác khối, sai thì hủy toàn bộ.
--        * p_dry_run = true chạy thật rồi hoàn tác, nên bản xem trước luôn khớp bản chạy thật.
--   6. Nâng cấp query_audit_logs (nhóm Hệ thống thêm school_year_rollover), export_center_backup
--      (thêm class_versions) và export_monthly_attendance_report (tên lớp theo ngày).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. CHỐT CHẶN: KHÔNG CHO CHẠY LẠI FILE NÀY SAU KHI ĐÃ CHẠY FILE 10
-- File 10 (V2-7) thay query_audit_logs bằng bản có thêm nhóm center_restore.
-- Chạy lại file 09 sẽ ghi đè về bản cũ. restore_center_backup chỉ do file 10 tạo ra.
-- ---------------------------------------------------------------------
do $guard$
begin
  if to_regprocedure('public.restore_center_backup(uuid,boolean,text)') is not null then
    raise exception 'DUNG LAI: Database da chay file 10 tro di. KHONG chay lai 09_v2_6_year_rollover.sql (se ghi de ham query_audit_logs da nang cap). Neu can cap nhat, hay chay file migration moi nhat (vi du 11).';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. Bảng class_versions
--    Không đặt khóa ngoại tới classes để không cản trở reset_mock_data.sql (giống audit_log).
-- ---------------------------------------------------------------------
create table if not exists public.class_versions (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null,
  name               text not null,
  subject            text,
  grade              smallint,
  class_no           integer,
  teacher_id         uuid,
  teacher_name       text,
  price_per_session  integer,
  valid_from         date not null,
  valid_to           date not null,
  reason             text not null default 'edit'
                     check (reason in ('edit', 'year_rollover')),
  batch_id           bigint not null default txid_current(),
  created_at         timestamptz not null default clock_timestamp(),
  constraint class_versions_range check (valid_to >= valid_from)
);

create index if not exists idx_class_versions_lookup
  on public.class_versions (class_id, valid_from, valid_to);

alter table public.class_versions enable row level security;

revoke all on table public.class_versions from anon, public;
revoke insert, update, delete, truncate on table public.class_versions from authenticated;
grant select on table public.class_versions to authenticated;

-- Một policy SELECT duy nhất (không đặt tên v2_teacher_* để giữ nguyên phép đếm 7 policy của check_before_launch.sql).
drop policy if exists v2_select_class_versions on public.class_versions;
create policy v2_select_class_versions on public.class_versions
  for select to authenticated
  using ((select public.is_manager()) or public.teacher_owns_class(class_id));

-- Chặn UPDATE / DELETE / TRUNCATE trực tiếp (DELETE chỉ được phép khi dọn dữ liệu thử có cờ xóa nhật ký).
create or replace function public._guard_class_versions_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('sciencehub.allow_audit_clear', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Trung tâm: Lịch sử nhãn lớp học được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa.';
end;
$$;

revoke execute on function public._guard_class_versions_immutable() from anon, authenticated, public;

drop trigger if exists trg_class_versions_immutable on public.class_versions;
create trigger trg_class_versions_immutable
  before update or delete on public.class_versions
  for each row execute function public._guard_class_versions_immutable();

create or replace function public._guard_class_versions_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Trung tâm: Lịch sử nhãn lớp học được bảo vệ toàn vẹn, không được phép chỉnh sửa hoặc xóa.';
end;
$$;

revoke execute on function public._guard_class_versions_truncate() from anon, authenticated, public;

drop trigger if exists trg_class_versions_no_truncate on public.class_versions;
create trigger trg_class_versions_no_truncate
  before truncate on public.class_versions
  for each statement execute function public._guard_class_versions_truncate();

-- ---------------------------------------------------------------------
-- 2. Trigger tự lưu nhãn cũ của lớp
--    Chỉ lưu thời kỳ đã đóng: từ ngày bắt đầu (ngày tạo lớp hoặc ngày sau thời kỳ trước)
--    đến NGÀY TRƯỚC ngày thay đổi. Ngày thay đổi thuộc nhãn mới.
--    Ngày thay đổi mặc định là hôm nay (giờ Việt Nam); rollover_school_year đặt theo ngày chuyển.
--    Thay đổi ngay trong ngày tạo lớp hoặc nhiều lần trong một ngày không sinh dòng rỗng.
-- ---------------------------------------------------------------------
create or replace function public._trg_class_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change date := coalesce(
                     nullif(current_setting('sciencehub.class_change_date', true), '')::date,
                     public.vn_today()
                   );
  v_reason text := case
                     when coalesce(current_setting('sciencehub.class_change_reason', true), '') = 'year_rollover'
                       then 'year_rollover'
                     else 'edit'
                   end;
  v_from   date;
  v_to     date := v_change - 1;
  v_tname  text;
begin
  select coalesce(max(v.valid_to) + 1, (old.created_at at time zone 'Asia/Ho_Chi_Minh')::date)
    into v_from
  from public.class_versions v
  where v.class_id = old.id;

  if v_from <= v_to then
    select t.full_name into v_tname from public.teachers t where t.id = old.teacher_id;

    insert into public.class_versions (
      class_id, name, subject, grade, class_no, teacher_id, teacher_name,
      price_per_session, valid_from, valid_to, reason
    ) values (
      old.id, old.name, old.subject, old.grade, old.class_no, old.teacher_id, v_tname,
      old.price_per_session, v_from, v_to, v_reason
    );
  end if;

  return new;
end;
$$;

revoke execute on function public._trg_class_versions() from anon, authenticated, public;

drop trigger if exists trg_class_versions on public.classes;
create trigger trg_class_versions
  after update of name, subject, grade, class_no, teacher_id on public.classes
  for each row
  when (
    old.name       is distinct from new.name
    or old.subject    is distinct from new.subject
    or old.grade      is distinct from new.grade
    or old.class_no   is distinct from new.class_no
    or old.teacher_id is distinct from new.teacher_id
  )
  execute function public._trg_class_versions();

-- ---------------------------------------------------------------------
-- 3. Nhãn của lớp tại một ngày
--    Chạy với quyền người gọi nên RLS tự giới hạn: Quản lý thấy mọi lớp, Giáo viên chỉ lớp của mình.
-- ---------------------------------------------------------------------
create or replace function public.class_label_on(p_class_id uuid, p_date date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
               'name',         v.name,
               'subject',      v.subject,
               'grade',        v.grade,
               'class_no',     v.class_no,
               'teacher_name', v.teacher_name
             )
      from public.class_versions v
      where v.class_id = p_class_id
        and p_date between v.valid_from and v.valid_to
      order by v.valid_to desc
      limit 1
    ),
    (
      select jsonb_build_object(
               'name',         c.name,
               'subject',      c.subject,
               'grade',        c.grade,
               'class_no',     c.class_no,
               'teacher_name', t.full_name
             )
      from public.classes c
      left join public.teachers t on t.id = c.teacher_id
      where c.id = p_class_id
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Bản nới của check_class_grade_change (gốc ở file 02)
--    Khi đổi khối của lớp A, kiểm tra xung đột với các lớp khác của cùng học sinh bị bỏ qua
--    nếu đang chạy rollover_school_year (cờ sciencehub.year_rollover = 'on', chỉ có hiệu lực trong giao dịch).
--    Phần tự cập nhật khối của học sinh vẫn chạy. rollover_school_year tự kiểm tra lại ở cuối.
-- ---------------------------------------------------------------------
create or replace function public.check_class_grade_change()
returns trigger language plpgsql as $$
declare
  v_student    text;
  v_other_name text;
begin
  if new.grade is null or new.grade is not distinct from old.grade then
    return new;
  end if;

  if coalesce(current_setting('sciencehub.year_rollover', true), '') <> 'on' then
    select s.full_name, c2.name
      into v_student, v_other_name
    from public.class_enrollments e
    join public.students s on s.id = e.student_id
    join public.class_enrollments e2
      on e2.student_id = e.student_id and e2.status = 'active' and e2.class_id <> new.id
    join public.classes c2 on c2.id = e2.class_id
    where e.class_id = new.id
      and e.status = 'active'
      and public.class_effective_grade(e2.class_id) is not null
      and public.class_effective_grade(e2.class_id) <> new.grade
    limit 1;

    if found then
      raise exception 'Không thể đổi lớp sang khối %: học sinh % còn đang học lớp % thuộc khối khác. Hãy cho học sinh đó nghỉ lớp kia trước.',
        new.grade, v_student, v_other_name;
    end if;
  end if;

  update public.students
  set grade = new.grade
  where grade is distinct from new.grade
    and id in (
      select student_id from public.class_enrollments
      where class_id = new.id and status = 'active'
    );

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Chuyển năm học
-- ---------------------------------------------------------------------

-- 5.1 Hàm nội bộ: thực hiện thay đổi (ném lỗi tiếng Việt nếu sai; người gọi quyết định giữ hay hoàn tác).
create or replace function public._rollover_apply(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_closing     constant integer[] := array[5, 9, 12];
  v_class       public.classes%rowtype;
  v_enr         record;
  v_closed      jsonb   := '[]'::jsonb;
  v_promoted    jsonb   := '[]'::jsonb;
  v_warnings    jsonb   := '[]'::jsonb;
  v_dropped     integer := 0;
  v_cls_dropped integer;
  v_new_grade   integer;
  v_parts       text[];
  v_no          integer;
  v_new_name    text;
  v_bad_student text;
  v_bad_classes text;
begin
  perform set_config('sciencehub.year_rollover',       'on',            true);
  perform set_config('sciencehub.class_change_date',   p_date::text,    true);
  perform set_config('sciencehub.class_change_reason', 'year_rollover', true);

  -- Bước 1: lớp cuối cấp (5, 9, 12) - cho nghỉ toàn bộ học sinh rồi ẩn lớp, giữ nguyên tên.
  for v_class in
    select * from public.classes
    where deleted_at is null and grade = any (c_closing)
    order by grade, name
  loop
    v_cls_dropped := 0;
    for v_enr in
      select e.id, e.joined_at
      from public.class_enrollments e
      where e.class_id = v_class.id and e.status = 'active'
      order by e.id
    loop
      perform public._drop_enrollment_core(v_enr.id, greatest(p_date - 1, v_enr.joined_at), false);
      v_cls_dropped := v_cls_dropped + 1;
    end loop;

    update public.classes set deleted_at = now() where id = v_class.id;

    v_dropped := v_dropped + v_cls_dropped;
    v_closed := v_closed || jsonb_build_object(
      'class_id', v_class.id,
      'name',     v_class.name,
      'grade',    v_class.grade,
      'students', v_cls_dropped
    );
  end loop;

  -- Bước 2: các lớp còn lại lên 1 khối, xử lý từ khối cao xuống thấp để tên không đụng nhau.
  for v_class in
    select * from public.classes
    where deleted_at is null and grade is not null and not (grade = any (c_closing))
    order by grade desc, name
  loop
    v_new_grade := v_class.grade + 1;
    v_parts := regexp_match(v_class.name, '^(.+)_' || v_class.grade::text || '_([^_]+)_([0-9]+)$');

    if v_parts is null then
      update public.classes set grade = v_new_grade where id = v_class.id;
      v_warnings := v_warnings || to_jsonb(format(
        'Lớp %s không theo mẫu Môn_Khối_TênGV_STT nên giữ nguyên tên; hãy bấm Sửa lớp để đặt lại tên cho khối %s.',
        v_class.name, v_new_grade
      ));
      v_promoted := v_promoted || jsonb_build_object(
        'class_id', v_class.id, 'old_name', v_class.name, 'new_name', v_class.name,
        'old_grade', v_class.grade, 'new_grade', v_new_grade
      );
    else
      v_no := coalesce(v_class.class_no, v_parts[3]::integer);
      loop
        v_new_name := v_parts[1] || '_' || v_new_grade::text || '_' || v_parts[2] || '_' || v_no::text;
        exit when not exists (
          select 1 from public.classes c
          where c.deleted_at is null and c.id <> v_class.id and lower(c.name) = lower(v_new_name)
        );
        v_no := v_no + 1;
      end loop;

      update public.classes
      set grade = v_new_grade, name = v_new_name, class_no = v_no
      where id = v_class.id;

      v_promoted := v_promoted || jsonb_build_object(
        'class_id', v_class.id, 'old_name', v_class.name, 'new_name', v_new_name,
        'old_grade', v_class.grade, 'new_grade', v_new_grade
      );
    end if;
  end loop;

  -- Bước 3: kiểm tra cuối - không học sinh nào học hai lớp khác khối.
  select x.full_name, x.class_names
    into v_bad_student, v_bad_classes
  from (
    select s.full_name,
           string_agg(distinct c.name, ', ') as class_names
    from public.students s
    join public.class_enrollments e on e.student_id = s.id and e.status = 'active'
    join public.classes c on c.id = e.class_id
    where public.class_effective_grade(c.id) is not null
    group by s.id, s.full_name
    having count(distinct public.class_effective_grade(c.id)) > 1
    order by s.full_name
    limit 1
  ) x;

  if v_bad_student is not null then
    raise exception 'Trung tâm: Sau khi chuyển năm học, học sinh % vẫn học các lớp khác khối (%). Toàn bộ thay đổi đã được hủy; hãy cho học sinh đó nghỉ hoặc đổi lớp rồi chạy lại.',
      v_bad_student, v_bad_classes;
  end if;

  perform public._write_audit_log(
    'school_year_rollover', 'school_year', null, null, null,
    format(
      'Quản lý chuyển năm học từ ngày %s: %s lớp lên khối, %s lớp cuối cấp được đóng, %s học sinh cho nghỉ.',
      to_char(p_date, 'DD/MM/YYYY'),
      jsonb_array_length(v_promoted), jsonb_array_length(v_closed), v_dropped
    ),
    null,
    jsonb_build_object(
      'rollover_date',    p_date,
      'promoted_count',   jsonb_array_length(v_promoted),
      'closed_count',     jsonb_array_length(v_closed),
      'dropped_students', v_dropped
    )
  );

  perform set_config('sciencehub.year_rollover',       '', true);
  perform set_config('sciencehub.class_change_date',   '', true);
  perform set_config('sciencehub.class_change_reason', '', true);

  return jsonb_build_object(
    'promoted',         v_promoted,
    'closed',           v_closed,
    'students_dropped', v_dropped,
    'warnings',         v_warnings
  );
end;
$$;

revoke execute on function public._rollover_apply(date) from anon, authenticated, public;

-- 5.2 RPC công khai (chỉ Quản lý)
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
  c_closing    constant integer[] := array[5, 9, 12];
  v_today      date    := public.vn_today();
  v_dry        boolean := coalesce(p_dry_run, true);
  v_errors     jsonb   := '[]'::jsonb;
  v_warnings   jsonb   := '[]'::jsonb;
  v_result     jsonb;
  v_msg        text;
  v_eligible   integer;
  v_no_grade   integer;
  v_last_run   timestamptz;
  r            record;
begin
  perform public.assert_manager();

  if p_date is null then
    raise exception 'Trung tâm: Vui lòng chọn ngày chuyển năm học.';
  end if;
  if p_date > v_today then
    raise exception 'Trung tâm: Ngày chuyển năm học không được ở tương lai.';
  end if;
  if not v_dry and trim(coalesce(p_confirm_text, '')) <> 'CHUYEN NAM HOC' then
    raise exception 'Trung tâm: Vui lòng nhập đúng cụm từ xác nhận "CHUYEN NAM HOC".';
  end if;

  select count(*) into v_eligible
  from public.classes where deleted_at is null and grade is not null;
  if v_eligible = 0 then
    v_errors := v_errors || to_jsonb('Không có lớp nào đang hiển thị có khối để chuyển.'::text);
  end if;

  select count(*) into v_no_grade
  from public.classes where deleted_at is null and grade is null;
  if v_no_grade > 0 then
    v_warnings := v_warnings || to_jsonb(format(
      '%s lớp chưa có khối nên được bỏ qua (hãy bấm Sửa lớp để đặt khối).', v_no_grade
    ));
  end if;

  -- Ngày chuyển thuộc năm học mới: không lớp nào được còn điểm danh từ ngày này trở đi.
  for r in
    select c.name, count(*) as n, max(a.attendance_date) as last_date
    from public.classes c
    join public.attendance_records a on a.class_id = c.id
    where c.deleted_at is null and c.grade is not null and a.attendance_date >= p_date
    group by c.id, c.name
    order by c.name
  loop
    v_errors := v_errors || to_jsonb(format(
      'Lớp %s đã có %s buổi điểm danh từ ngày %s (gần nhất %s). Hãy chọn ngày chuyển sau buổi học cuối của năm học cũ.',
      r.name, r.n, to_char(p_date, 'DD/MM/YYYY'), to_char(r.last_date, 'DD/MM/YYYY')
    ));
  end loop;

  -- Học bù của học sinh lớp cuối cấp được ghi ở lớp khác nhưng vẫn gắn với ghi danh lớp cuối cấp.
  for r in
    select c.name, count(*) as n, max(a.attendance_date) as last_date
    from public.attendance_records a
    join public.class_enrollments e on e.id = a.enrollment_id and e.status = 'active'
    join public.classes c on c.id = e.class_id
    where c.deleted_at is null
      and c.grade = any (c_closing)
      and a.class_id <> e.class_id
      and a.attendance_date >= p_date
    group by c.id, c.name
    order by c.name
  loop
    v_errors := v_errors || to_jsonb(format(
      'Học sinh lớp %s có %s buổi học bù từ ngày %s (gần nhất %s). Hãy chọn ngày chuyển sau buổi học cuối của năm học cũ.',
      r.name, r.n, to_char(p_date, 'DD/MM/YYYY'), to_char(r.last_date, 'DD/MM/YYYY')
    ));
  end loop;

  select max(v.created_at) into v_last_run
  from public.class_versions v
  where v.reason = 'year_rollover' and v.created_at > now() - interval '200 days';
  if v_last_run is not null then
    v_warnings := v_warnings || to_jsonb(format(
      'Trung tâm đã chuyển năm học lần gần nhất vào ngày %s. Hãy chắc chắn không chạy hai lần trong cùng một năm học.',
      to_char(v_last_run at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
    ));
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'dry_run', v_dry, 'ok', false, 'applied', false, 'date', p_date,
      'promoted', '[]'::jsonb, 'closed', '[]'::jsonb, 'students_dropped', 0,
      'warnings', v_warnings, 'errors', v_errors
    );
  end if;

  if v_dry then
    -- Chạy thật trong khối con rồi hoàn tác bằng ngoại lệ có chủ đích; kết quả đi kèm trong thông báo.
    begin
      v_result := public._rollover_apply(p_date);
      raise exception '%', v_result::text using errcode = 'SH001';
    exception
      when sqlstate 'SH001' then
        get stacked diagnostics v_msg = message_text;
        v_result := v_msg::jsonb;
      when others then
        get stacked diagnostics v_msg = message_text;
        return jsonb_build_object(
          'dry_run', true, 'ok', false, 'applied', false, 'date', p_date,
          'promoted', '[]'::jsonb, 'closed', '[]'::jsonb, 'students_dropped', 0,
          'warnings', v_warnings, 'errors', jsonb_build_array(v_msg)
        );
    end;
  else
    v_result := public._rollover_apply(p_date);
  end if;

  return jsonb_build_object(
    'dry_run',          v_dry,
    'ok',               true,
    'applied',          not v_dry,
    'date',             p_date,
    'promoted',         v_result->'promoted',
    'closed',           v_result->'closed',
    'students_dropped', (v_result->>'students_dropped')::integer,
    'warnings',         v_warnings || (v_result->'warnings'),
    'errors',           '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Nâng cấp các hàm của file 06 và 07
-- ---------------------------------------------------------------------

-- 6.1 query_audit_logs: nhóm "Hệ thống" gồm thêm school_year_rollover (phần còn lại giữ nguyên file 06).
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
        or (p_action_group = 'system'     and l.action in ('backup_export', 'audit_log_clear', 'school_year_rollover'))
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

-- 6.2 export_center_backup: thêm bảng class_versions vào bản sao lưu (phần còn lại giữ nguyên file 07).
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
    'class_enrollments', 'attendance_records', 'profiles', 'class_versions', 'audit_log'
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
      when 'class_versions' then (
        select coalesce(jsonb_agg(to_jsonb(x.*) order by x.class_id, x.valid_from, x.id), '[]'::jsonb)
        from public.class_versions x)
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
      'version',     'V2-6',
      'exported_at', now(),
      'vn_date',     public.vn_today(),
      'school_year', public.vn_school_year_bounds(),
      'counts',      v_counts
    ),
    'tables', v_tables
  );
end;
$$;

-- 6.3 export_monthly_attendance_report: tên lớp, môn, khối, giáo viên theo NGÀY điểm danh cuối của dòng
--     trong tháng (không có buổi nào thì theo ngày đầu tháng). Cách cộng học phí giữ nguyên file 07.
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
        'student_code',      y.student_code,
        'student_name',      y.student_name,
        'student_phone',     y.student_phone,
        'grade',             y.grade,
        'parent_code',       y.parent_code,
        'parent_name',       y.parent_name,
        'parent_phone',      y.parent_phone,
        'class_name',        y.class_name,
        'subject',           y.subject,
        'teacher_name',      y.teacher_name,
        'enrollment_status', y.enrollment_status,
        'joined_at',         y.joined_at,
        'left_at',           y.left_at,
        'present_count',     y.present_count,
        'makeup_count',      y.makeup_count,
        'absent_count',      y.absent_count,
        'excused_count',     y.excused_count,
        'charged_sessions',  y.charged_sessions,
        'total_tuition',     y.total_tuition
      )
      order by y.class_name, y.student_name, y.enrollment_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      x.enrollment_id,
      x.student_code,
      x.student_name,
      x.student_phone,
      coalesce((l.label->>'grade')::smallint, x.student_grade) as grade,
      x.parent_code,
      x.parent_name,
      x.parent_phone,
      coalesce(l.label->>'name', '')                           as class_name,
      coalesce(l.label->>'subject', '')                        as subject,
      coalesce(l.label->>'teacher_name', '')                   as teacher_name,
      x.enrollment_status,
      x.joined_at,
      x.left_at,
      x.present_count,
      x.makeup_count,
      x.absent_count,
      x.excused_count,
      x.charged_sessions,
      x.total_tuition
    from (
      select
        e.id                                   as enrollment_id,
        e.class_id,
        s.student_code,
        s.full_name                            as student_name,
        coalesce(s.phone, '')                  as student_phone,
        s.grade                                as student_grade,
        coalesce(p.parent_code, '')            as parent_code,
        coalesce(p.full_name, '')              as parent_name,
        coalesce(p.phone, '')                  as parent_phone,
        e.status                               as enrollment_status,
        e.joined_at,
        e.left_at,
        coalesce(max(a.attendance_date), v_start)                                   as ref_date,
        count(a.id) filter (where a.status = 'present' and a.class_id = e.class_id) as present_count,
        count(a.id) filter (where a.status = 'present' and a.class_id <> e.class_id) as makeup_count,
        count(a.id) filter (where a.status = 'absent')                              as absent_count,
        count(a.id) filter (where a.status = 'absent_excused')                      as excused_count,
        count(a.id) filter (where a.status in ('present', 'absent'))                as charged_sessions,
        coalesce(sum(a.price_snapshot) filter (where a.status in ('present', 'absent')), 0) as total_tuition
      from public.class_enrollments e
      join public.students s on s.id = e.student_id
      left join public.parents p on p.id = s.parent_id
      left join public.attendance_records a
        on a.enrollment_id = e.id
       and a.attendance_date >= v_start
       and a.attendance_date <  v_next
      where e.joined_at < v_next
        and (e.left_at is null or e.left_at >= v_start)
      group by
        e.id, e.status, e.joined_at, e.left_at, e.class_id,
        s.id, s.student_code, s.full_name, s.phone, s.grade,
        p.parent_code, p.full_name, p.phone
    ) x
    cross join lateral (select public.class_label_on(x.class_id, x.ref_date) as label) l
  ) y;

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
-- 7. Chốt quyền EXECUTE
-- ---------------------------------------------------------------------
revoke execute on function public.class_label_on(uuid, date)                  from anon, public;
revoke execute on function public.rollover_school_year(date, boolean, text)   from anon, public;
revoke execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                              from anon, public;
revoke execute on function public.export_center_backup(boolean, text[])       from anon, public;
revoke execute on function public.export_monthly_attendance_report(integer, integer)
                                                                              from anon, public;

grant execute on function public.class_label_on(uuid, date)                   to authenticated;
grant execute on function public.rollover_school_year(date, boolean, text)    to authenticated;
grant execute on function public.query_audit_logs(date, date, text, uuid, text, uuid, uuid, text, integer, integer)
                                                                              to authenticated;
grant execute on function public.export_center_backup(boolean, text[])        to authenticated;
grant execute on function public.export_monthly_attendance_report(integer, integer)
                                                                              to authenticated;

notify pgrst, 'reload schema';
