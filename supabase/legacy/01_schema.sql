-- =====================================================================
-- Trung tâm ScienceHub - FILE 01: CẤU TRÚC BẢNG & HÀM TIỆN ÍCH CƠ SỞ
-- Chạy ĐẦU TIÊN trong Supabase SQL Editor.
-- Đã hợp nhất toàn bộ thay đổi cấu trúc từ Lát cắt 1 đến V2-1:
--   * Không còn các cột lịch cũ trên bảng classes (dùng class_schedules).
--   * Có sẵn deleted_at, định dạng SĐT, cột grade, và bảng profiles.
--   * An toàn khi chạy lại nhiều lần (Idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Bộ đếm mã tự sinh & Hàm tiện ích thời gian (Múi giờ Việt Nam)
-- ---------------------------------------------------------------------
create sequence if not exists public.parent_code_seq;
create sequence if not exists public.student_code_seq;

create or replace function public.vn_today()
returns date
language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create or replace function public.vn_month_start(p_date date default public.vn_today())
returns date
language sql stable as $$
  select date_trunc('month', p_date)::date;
$$;

-- Quy đổi ngày sang thứ của ScienceHub: 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật
create or replace function public.vn_day_of_week(p_date date)
returns smallint
language sql immutable as $$
  select (extract(isodow from p_date)::integer + 1)::smallint;
$$;

-- ---------------------------------------------------------------------
-- 1. Bảng parents - Phụ huynh (1 phụ huynh có thể có nhiều con)
-- ---------------------------------------------------------------------
create table if not exists public.parents (
  id           uuid primary key default gen_random_uuid(),
  parent_code  text not null unique
               default ('PH' || lpad(nextval('public.parent_code_seq')::text, 4, '0')),
  full_name    text not null,
  phone        text not null unique,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint parents_phone_format check (phone ~ '^0[0-9]{9}$')
);

-- ---------------------------------------------------------------------
-- 2. Bảng teachers - Giáo viên
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  email        text,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint teachers_phone_format check (phone is null or phone ~ '^0[0-9]{9}$')
);

create unique index if not exists uq_teachers_phone on public.teachers(phone);

-- ---------------------------------------------------------------------
-- 3. Bảng students - Học sinh
--    grade: tự gán theo khối lớp khi ghi danh (1..12).
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  student_code  text not null unique
                default ('HS' || lpad(nextval('public.student_code_seq')::text, 4, '0')),
  full_name     text not null,
  phone         text,
  parent_id     uuid references public.parents(id) on delete restrict,
  grade         smallint,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint students_phone_format check (phone is null or phone ~ '^0[0-9]{9}$'),
  constraint students_grade_range  check (grade is null or grade between 1 and 12)
);

create unique index if not exists uq_students_phone on public.students(phone);
create index if not exists idx_students_parent_id on public.students(parent_id);

-- ---------------------------------------------------------------------
-- 4. Bảng classes - Lớp học
--    Tên lớp tự sinh: Môn_Khối_TênGV_STT (duy nhất giữa các lớp chưa ẩn).
--    Lịch học lưu ở bảng class_schedules.
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  subject            text,
  grade              smallint,
  class_no           integer,
  teacher_id         uuid references public.teachers(id) on delete restrict,
  price_per_session  integer not null default 0 check (price_per_session >= 0),
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  constraint classes_grade_range       check (grade is null or grade between 1 and 12),
  constraint classes_class_no_positive check (class_no is null or class_no >= 1)
);

create index if not exists idx_classes_teacher_id on public.classes(teacher_id);
create unique index if not exists uq_classes_name_active
  on public.classes (lower(name))
  where deleted_at is null;

-- Hàm lấy khối hiệu lực của lớp (dùng cột grade, dự phòng tách số cuối tên lớp)
create or replace function public.class_effective_grade(p_class_id uuid)
returns smallint
language sql stable as $$
  select coalesce(
    c.grade::integer,
    (
      select g
      from (select substring(c.name from '\s([0-9]{1,2})$')::integer as g) x
      where g between 1 and 12
    )
  )::smallint
  from public.classes c
  where c.id = p_class_id;
$$;

-- ---------------------------------------------------------------------
-- 5. Bảng class_schedules - Lịch học trong tuần của từng lớp
--    day_of_week: 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật.
--    Mỗi lớp mỗi thứ tối đa 1 ca học.
-- ---------------------------------------------------------------------
create table if not exists public.class_schedules (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete restrict,
  day_of_week  smallint not null check (day_of_week between 2 and 8),
  start_time   time not null,
  end_time     time not null,
  created_at   timestamptz not null default now(),
  constraint class_schedules_time_order check (end_time > start_time),
  constraint uq_class_schedules_day     unique (class_id, day_of_week)
);

create index if not exists idx_class_schedules_class_id on public.class_schedules(class_id);
create index if not exists idx_class_schedules_day      on public.class_schedules(day_of_week);

-- ---------------------------------------------------------------------
-- 6. Bảng class_enrollments - Ghi danh học sinh vào lớp
--    status: 'active' (Đang học) | 'dropped' (Đã nghỉ, bắt buộc có left_at).
-- ---------------------------------------------------------------------
create table if not exists public.class_enrollments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete restrict,
  student_id  uuid not null references public.students(id) on delete restrict,
  status      text not null default 'active'
              check (status in ('active', 'dropped')),
  joined_at   date not null default public.vn_today(),
  left_at     date,
  created_at  timestamptz not null default now(),
  constraint enrollments_dropped_needs_left_at check (
    (status = 'active'  and left_at is null) or
    (status = 'dropped' and left_at is not null)
  ),
  constraint enrollments_left_after_joined check (
    left_at is null or left_at >= joined_at
  )
);

create unique index if not exists uq_enrollments_one_active
  on public.class_enrollments(class_id, student_id)
  where status = 'active';

create index if not exists idx_enrollments_student_id on public.class_enrollments(student_id);
create index if not exists idx_enrollments_class_id   on public.class_enrollments(class_id);

-- ---------------------------------------------------------------------
-- 7. Bảng attendance_records - Điểm danh & Đóng băng đơn giá
--    present / absent: tính tiền (lưu price_snapshot).
--    absent_excused  : không tính tiền (price_snapshot IS NULL).
--    Học bù          : class_id = lớp bù, enrollment_id = ghi danh lớp gốc.
-- ---------------------------------------------------------------------
create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  enrollment_id    uuid not null references public.class_enrollments(id) on delete restrict,
  class_id         uuid not null references public.classes(id) on delete restrict,
  student_id       uuid not null references public.students(id) on delete restrict,
  attendance_date  date not null,
  status           text not null
                   check (status in ('present', 'absent', 'absent_excused')),
  price_snapshot   integer check (price_snapshot >= 0),
  created_at       timestamptz not null default now(),
  constraint attendance_snapshot_rule check (
    (status in ('present', 'absent') and price_snapshot is not null) or
    (status = 'absent_excused'       and price_snapshot is null)
  ),
  constraint attendance_one_per_day unique (class_id, student_id, attendance_date)
);

create index if not exists idx_attendance_date          on public.attendance_records(attendance_date);
create index if not exists idx_attendance_enrollment_id on public.attendance_records(enrollment_id);

-- ---------------------------------------------------------------------
-- 8. Bảng profiles - Tài khoản & Vai trò (V2)
--    manager: teacher_id = NULL. teacher: bắt buộc có teacher_id duy nhất.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('manager', 'teacher')),
  teacher_id uuid unique references public.teachers(id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_teacher_check check (
    (role = 'teacher' and teacher_id is not null) or
    (role = 'manager' and teacher_id is null)
  )
);

-- ---------------------------------------------------------------------
-- 9. Bật RLS trên toàn bộ 8 bảng
--    (Trước khi chạy 04_lockdown_rls.sql, mở tạm v1_open_access trên 7 bảng
--     nghiệp vụ để bạn tạo Quản lý đầu tiên và kiểm tra đăng nhập an toàn)
-- ---------------------------------------------------------------------
alter table public.parents            enable row level security;
alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.classes            enable row level security;
alter table public.class_schedules    enable row level security;
alter table public.class_enrollments  enable row level security;
alter table public.attendance_records enable row level security;
alter table public.profiles           enable row level security;

revoke all on table public.profiles from anon;

do $$
declare
  t text;
begin
  -- Chỉ tạo v1_open_access nếu chưa khóa quyền (chưa có v2_manager_all)
  for t in select unnest(array[
    'parents', 'teachers', 'students', 'classes',
    'class_schedules', 'class_enrollments', 'attendance_records'
  ]) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'v2_manager_all'
    ) then
      execute format('drop policy if exists v1_open_access on public.%I', t);
      execute format(
        'create policy v1_open_access on public.%I for all to anon, authenticated using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
