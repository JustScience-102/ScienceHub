-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 01: BẢNG DỮ LIỆU
-- Chạy sau 00_meta.sql. Chạy lại an toàn (create ... if not exists).
-- Khóa ngoại nghiệp vụ dùng ON DELETE RESTRICT. Mọi bảng bật RLS; quyền cấp ở 09_grants.sql.
-- =====================================================================

create sequence if not exists public.parent_code_seq;
create sequence if not exists public.student_code_seq;

-- ---------------------------------------------------------------------
-- Phụ huynh (1 phụ huynh có thể có nhiều con). deleted_at do hệ thống tự đặt theo các con.
-- ---------------------------------------------------------------------
create table if not exists public.parents (
  id           uuid primary key default gen_random_uuid(),
  parent_code  text not null unique
               default ('PH' || lpad(nextval('public.parent_code_seq')::text, 4, '0')),
  full_name    text not null check (btrim(full_name) <> ''),
  phone        text not null unique,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint parents_phone_format check (phone ~ '^0[0-9]{9}$')
);

-- ---------------------------------------------------------------------
-- Giáo viên
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (btrim(full_name) <> ''),
  phone        text,
  email        text,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint teachers_phone_format check (phone is null or phone ~ '^0[0-9]{9}$')
);

create unique index if not exists uq_teachers_phone on public.teachers (phone);

-- ---------------------------------------------------------------------
-- Học sinh. grade và deleted_at do hệ thống tự tính từ các lớp đang học (_sync_student_state).
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  student_code  text not null unique
                default ('HS' || lpad(nextval('public.student_code_seq')::text, 4, '0')),
  full_name     text not null check (btrim(full_name) <> ''),
  phone         text,
  parent_id     uuid references public.parents (id) on delete restrict,
  grade         smallint check (grade is null or grade between 1 and 12),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint students_phone_format check (phone is null or phone ~ '^0[0-9]{9}$')
);

create unique index if not exists uq_students_phone on public.students (phone);
create index if not exists idx_students_parent_id on public.students (parent_id);

-- ---------------------------------------------------------------------
-- Lớp học. name do Database tự sinh (Môn_Khối_TênGọiGV_STT, file 03_naming.sql), không ghi tay.
-- Mỗi "chỗ" (môn, khối, giáo viên, STT) chỉ có 1 lớp đang hiển thị.
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null default '',
  subject            text not null check (btrim(subject) <> ''),
  grade              smallint not null check (grade between 1 and 12),
  class_no           integer not null check (class_no >= 1),
  teacher_id         uuid not null references public.teachers (id) on delete restrict,
  price_per_session  integer not null default 0 check (price_per_session >= 0),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create unique index if not exists uq_classes_slot_active
  on public.classes (subject, grade, teacher_id, class_no)
  where deleted_at is null;
create index if not exists idx_classes_teacher_id on public.classes (teacher_id);
create index if not exists idx_classes_name on public.classes (lower(name));

-- ---------------------------------------------------------------------
-- Lịch học theo thời kỳ. valid_from NULL = áp dụng từ đầu; valid_to NULL = lịch hiện hành.
-- day_of_week: 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật. Mỗi lớp mỗi thứ tối đa 1 ca trong cùng thời kỳ.
-- ---------------------------------------------------------------------
create table if not exists public.class_schedules (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes (id) on delete restrict,
  day_of_week  smallint not null check (day_of_week between 2 and 8),
  start_time   time not null,
  end_time     time not null,
  valid_from   date,
  valid_to     date,
  created_at   timestamptz not null default now(),
  constraint class_schedules_time_order check (end_time > start_time),
  constraint class_schedules_period check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create unique index if not exists uq_class_schedules_current
  on public.class_schedules (class_id, day_of_week)
  where valid_to is null;
create index if not exists idx_class_schedules_class_id on public.class_schedules (class_id);

-- ---------------------------------------------------------------------
-- Ghi danh. Nghỉ học là xóa mềm: status = 'dropped' + left_at + left_reason.
--   left_reason: 'dropped' (nghỉ hẳn) | 'transferred' (đổi lớp, transfer_to_id = ghi danh mới)
--                | 'graduated' (lớp cuối cấp đóng khi chuyển năm học)
-- ---------------------------------------------------------------------
create table if not exists public.class_enrollments (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete restrict,
  student_id      uuid not null references public.students (id) on delete restrict,
  status          text not null default 'active' check (status in ('active', 'dropped')),
  joined_at       date not null default public.vn_today(),
  left_at         date,
  left_reason     text check (left_reason in ('dropped', 'transferred', 'graduated')),
  -- NO ACTION (kiểm tra cuối câu lệnh) để khôi phục xóa/nạp cả bảng trong một lệnh được.
  transfer_to_id  uuid references public.class_enrollments (id),
  created_at      timestamptz not null default now(),
  constraint enrollments_state check (
    (status = 'active'  and left_at is null and left_reason is null and transfer_to_id is null) or
    (status = 'dropped' and left_at is not null and left_reason is not null)
  ),
  constraint enrollments_transfer_link check (transfer_to_id is null or left_reason = 'transferred'),
  constraint enrollments_left_after_joined check (left_at is null or left_at >= joined_at)
);

create unique index if not exists uq_enrollments_one_active
  on public.class_enrollments (class_id, student_id)
  where status = 'active';
create index if not exists idx_enrollments_student_id on public.class_enrollments (student_id);
create index if not exists idx_enrollments_class_id   on public.class_enrollments (class_id);

-- ---------------------------------------------------------------------
-- Điểm danh & đơn giá đóng băng.
--   present / absent: tính tiền (price_snapshot bắt buộc); absent_excused: không tính (NULL).
--   Học bù: class_id = lớp bù, enrollment_id = ghi danh lớp gốc, makeup_of_date = ngày buổi gốc,
--   makeup_prev_* = trạng thái/giá của buổi gốc TRƯỚC khi bù (để "Hủy học bù" trả lại đúng).
--   Mỗi buổi gốc chỉ được bù 1 lần (uq_attendance_makeup_once).
-- ---------------------------------------------------------------------
create table if not exists public.attendance_records (
  id                  uuid primary key default gen_random_uuid(),
  enrollment_id       uuid not null references public.class_enrollments (id) on delete restrict,
  class_id            uuid not null references public.classes (id) on delete restrict,
  student_id          uuid not null references public.students (id) on delete restrict,
  attendance_date     date not null,
  status              text not null check (status in ('present', 'absent', 'absent_excused')),
  price_snapshot      integer check (price_snapshot >= 0),
  makeup_of_date      date,
  makeup_prev_status  text check (makeup_prev_status in ('present', 'absent', 'absent_excused')),
  makeup_prev_price   integer check (makeup_prev_price >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint attendance_snapshot_rule check (
    (status in ('present', 'absent') and price_snapshot is not null) or
    (status = 'absent_excused'       and price_snapshot is null)
  ),
  constraint attendance_makeup_fields check (
    makeup_of_date is not null or (makeup_prev_status is null and makeup_prev_price is null)
  ),
  constraint attendance_one_per_day unique (class_id, student_id, attendance_date)
);

create unique index if not exists uq_attendance_makeup_once
  on public.attendance_records (enrollment_id, makeup_of_date)
  where makeup_of_date is not null;
create index if not exists idx_attendance_date          on public.attendance_records (attendance_date);
create index if not exists idx_attendance_enrollment_id on public.attendance_records (enrollment_id);
create index if not exists idx_attendance_student_date  on public.attendance_records (student_id, attendance_date);

-- ---------------------------------------------------------------------
-- Tài khoản & vai trò. manager: teacher_id NULL; teacher: teacher_id duy nhất.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('manager', 'teacher')),
  teacher_id uuid unique references public.teachers (id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_teacher_check check (
    (role = 'teacher' and teacher_id is not null) or
    (role = 'manager' and teacher_id is null)
  )
);

-- ---------------------------------------------------------------------
-- Lịch sử cấu trúc lớp theo thời kỳ ĐÃ ĐÓNG (chỉ thêm, không sửa/xóa).
-- Chỉ lưu môn/khối/STT/giáo viên; tên lớp và tên giáo viên được tính lại khi đọc
-- (view class_versions_labeled) nên sửa họ tên giáo viên thì lịch sử cũng đổi theo.
-- ---------------------------------------------------------------------
create table if not exists public.class_versions (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.classes (id) on delete restrict,
  subject            text,
  grade              smallint,
  class_no           integer,
  teacher_id         uuid references public.teachers (id) on delete restrict,
  price_per_session  integer,
  valid_from         date not null,
  valid_to           date not null,
  reason             text not null default 'edit' check (reason in ('edit', 'year_rollover')),
  batch_id           bigint not null default txid_current(),
  created_at         timestamptz not null default clock_timestamp(),
  constraint class_versions_range check (valid_to >= valid_from)
);

create index if not exists idx_class_versions_lookup
  on public.class_versions (class_id, valid_from, valid_to);

-- ---------------------------------------------------------------------
-- Khóa sổ theo tháng: có dòng = tháng đã chốt (không ai thêm/sửa/xóa điểm danh của tháng đó).
-- ---------------------------------------------------------------------
create table if not exists public.month_closures (
  month_start     date primary key check (extract(day from month_start) = 1),
  closed_at       timestamptz not null default now(),
  closed_by       uuid,
  closed_by_name  text
);

-- ---------------------------------------------------------------------
-- Nhật ký thay đổi (không khóa ngoại để không cản trở thao tác xóa có kiểm soát).
-- action_group được ghi lúc tạo dòng (hàm _audit_action_group) để lọc nhanh.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default clock_timestamp(),
  batch_id         bigint not null default txid_current(),
  actor_user_id    uuid,
  actor_role       text not null default 'system' check (actor_role in ('manager', 'teacher', 'system')),
  actor_teacher_id uuid,
  actor_name       text not null default 'Hệ thống',
  action           text not null,
  action_group     text not null default 'other',
  table_name       text not null,
  record_id        uuid,
  class_id         uuid,
  student_id       uuid,
  summary          text not null,
  old_data         jsonb,
  new_data         jsonb
);

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc, id desc);
create index if not exists idx_audit_log_group      on public.audit_log (action_group, created_at desc);
create index if not exists idx_audit_log_class_id   on public.audit_log (class_id) where class_id is not null;
create index if not exists idx_audit_log_student_id on public.audit_log (student_id) where student_id is not null;
create index if not exists idx_audit_log_actor      on public.audit_log (actor_teacher_id) where actor_teacher_id is not null;

-- ---------------------------------------------------------------------
-- Bảng tạm chứa file sao lưu đang tải lên (chỉ RPC SECURITY DEFINER đọc/ghi).
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

-- ---------------------------------------------------------------------
-- RLS bật trên mọi bảng
-- ---------------------------------------------------------------------
alter table public.parents            enable row level security;
alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.classes            enable row level security;
alter table public.class_schedules    enable row level security;
alter table public.class_enrollments  enable row level security;
alter table public.attendance_records enable row level security;
alter table public.profiles           enable row level security;
alter table public.class_versions     enable row level security;
alter table public.month_closures     enable row level security;
alter table public.audit_log          enable row level security;
alter table public.restore_staging    enable row level security;
