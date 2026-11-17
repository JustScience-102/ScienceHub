-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 10: NỐI APP GIAO BÀI TẬP SCIENCEHUB (kho ScienceApp)
-- Chạy sau 09_grants.sql, rồi chạy lại 09_grants.sql. Chạy lại an toàn.
--
-- App giao bài (ScienceApp, Supabase riêng) nối vào Database này bằng tài khoản CSDL "sciencehub_link"
-- (tạo bằng lệnh `npm run dong-bo -- noi-trung-tam` của ScienceApp, tệp noi-trung-tam.sql; mật khẩu không nằm ở đây):
--   * đọc danh sách học sinh/lớp/ghi danh qua sciencehub.roster() (không đọc số điện thoại, phụ huynh, học phí);
--   * ghi điểm vào sciencehub.results, mỗi (bài, học sinh) một dòng, sau mỗi lần học sinh nộp bài.
-- Mọi thứ của ScienceApp nằm trong schema riêng "sciencehub" (PostgREST không mở schema này); giao diện Trung tâm
-- chỉ đọc điểm qua RPC public.student_homework_history (Quản lý: mọi học sinh; Giáo viên: học sinh lớp mình).
-- sciencehub.results nối học sinh bằng mã HS, không khóa ngoại: khôi phục sao lưu, chuyển năm học không bị chặn.
-- Bảng này là bản sao điểm của ScienceApp, không nằm trong file sao lưu .json của Trung tâm; mất thì ScienceApp
-- gửi lại toàn bộ (`npm run dong-bo -- gui-diem tat-ca`).
-- =====================================================================

create schema if not exists sciencehub;
revoke all on schema sciencehub from public;

create table if not exists sciencehub.results (
  assignment_id     text not null,
  student_code      text not null,
  title             text not null,
  subject           text,                         -- 'Vật Lí' | 'Hóa học' (cùng cách viết với môn của lớp)
  kind              text not null check (kind in ('class', 'tower')),  -- class: bài tại lớp · tower: tháp bài về nhà
  score10           numeric(4, 2),                -- bài tại lớp: điểm cao nhất (thang 10); tháp: null
  floors_total      smallint,                     -- tháp: số tầng
  floors_passed     smallint,                     -- tháp: số tầng đã qua
  floors            jsonb,                        -- tháp: [{"floor":1,"score10":8.5,"passed":true,"attempts":2}, ...]
  attempts          smallint not null default 0,  -- số lượt đã nộp (tính điểm)
  first_started_at  timestamptz,
  last_submitted_at timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (assignment_id, student_code)
);
create index if not exists idx_sciencehub_results_student on sciencehub.results (student_code, last_submitted_at desc);
alter table sciencehub.results enable row level security;

-- Danh sách cho ScienceApp đồng bộ tài khoản học sinh (chỉ sciencehub_link gọi được).
create or replace function sciencehub.roster()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', s.student_code, 'name', s.full_name, 'grade', s.grade, 'left', s.deleted_at is not null))
      from public.students s), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'subject', c.subject, 'grade', c.grade, 'active', c.deleted_at is null))
      from public.classes c), '[]'::jsonb),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', e.class_id, 'code', s.student_code))
      from public.class_enrollments e
      join public.students s on s.id = e.student_id
      where e.status = 'active'), '[]'::jsonb)
  );
$$;
revoke all on function sciencehub.roster() from public;

-- Tài khoản kết nối đã có (đã chạy noi-trung-tam.sql của ScienceApp) thì giữ đủ quyền khi chạy lại file này.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sciencehub_link') then
    grant usage on schema sciencehub to sciencehub_link;
    grant execute on function sciencehub.roster() to sciencehub_link;
    grant select, insert, update, delete on sciencehub.results to sciencehub_link;
    drop policy if exists sciencehub_link_all on sciencehub.results;
    create policy sciencehub_link_all on sciencehub.results for all to sciencehub_link using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Lịch sử làm bài tập của một học sinh (tab "Lịch sử làm bài tập" trong hồ sơ học sinh).
-- Quản lý xem mọi học sinh; Giáo viên chỉ xem học sinh từng học lớp mình (my_student_ids). Mới nộp trước.
-- ---------------------------------------------------------------------
create or replace function public.student_homework_history(p_student_id uuid)
returns table (
  assignment_id     text,
  title             text,
  subject           text,
  kind              text,
  score10           numeric,
  floors_total      smallint,
  floors_passed     smallint,
  floors            jsonb,
  attempts          smallint,
  first_started_at  timestamptz,
  last_submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.assert_staff();
  v_code text;
begin
  if v_role <> 'manager' and not (p_student_id = any (public.my_student_ids())) then
    raise exception 'Trung tâm: Bạn chỉ xem được lịch sử bài tập của học sinh thuộc lớp mình phụ trách.';
  end if;
  select s.student_code into v_code from public.students s where s.id = p_student_id;
  if v_code is null then
    raise exception 'Trung tâm không tìm thấy học sinh này.';
  end if;
  return query
    select r.assignment_id, r.title, r.subject, r.kind, r.score10, r.floors_total, r.floors_passed, r.floors,
           r.attempts, r.first_started_at, r.last_submitted_at
    from sciencehub.results r
    where r.student_code = v_code
    order by r.last_submitted_at desc nulls last, r.title;
end;
$$;

-- 09_grants.sql cũng cấp quyền này (hàm public không bắt đầu bằng "_"); ghi ở đây để chạy file này sau 09 vẫn dùng được ngay.
revoke all on function public.student_homework_history(uuid) from public, anon;
grant execute on function public.student_homework_history(uuid) to authenticated;

insert into public.schema_migrations (version, note)
values ('V3.1', 'Nối app giao bài ScienceHub: schema sciencehub, lịch sử làm bài tập (10_sciencehub.sql)')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
