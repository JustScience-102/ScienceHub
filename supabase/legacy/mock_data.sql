-- =====================================================================
-- Trung tâm ScienceHub - DỮ LIỆU GIẢ LẬP (Mock Data) theo cấu trúc mới
-- Chạy SAU 01_schema.sql, 02_triggers.sql, 03_rpc_and_auth.sql
-- (chạy trong Supabase > SQL Editor, bằng quyền postgres nên không vướng RLS).
--
-- Quy ước đã tuân thủ:
--   * Tên lớp theo công thức Môn_Khối_TênGV_STT (ví dụ Toan_9_Lan_1).
--   * Lịch học nằm ở class_schedules (2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật).
--   * Mỗi học sinh chỉ học các lớp CÙNG KHỐI (trigger check_enrollment_grade).
--   * Ghi danh 'dropped' được tạo bằng INSERT 'active' rồi UPDATE, để trigger
--     tự ẩn học sinh khi hết lớp đang học (giống thao tác thật trên giao diện).
--   * Đơn giá đóng băng ở price_snapshot: Toan_9_Lan_1 đang là 150.000đ nhưng
--     điểm danh tháng 9 giữ 100.000đ.
--
-- File tự dừng nếu Database đã có dữ liệu để không trộn lẫn / ghi đè.
-- KHÔNG chạy trên Database chứa dữ liệu thật. Xóa mock data trước khi nhập thật.
-- =====================================================================

do $$
begin
  if to_regclass('public.class_schedules') is null then
    raise exception 'Trung tâm: Chưa có bảng class_schedules. Hãy chạy 01_schema.sql -> 03_rpc_and_auth.sql trước.';
  end if;

  if exists (select 1 from public.students) or exists (select 1 from public.classes)
     or exists (select 1 from public.teachers) or exists (select 1 from public.parents) then
    raise exception 'Database đã có dữ liệu. Không chạy mock_data.sql để tránh trùng lặp.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Giáo viên (3)
-- ---------------------------------------------------------------------
insert into public.teachers (full_name, phone, email) values
  ('Nguyễn Thị Lan',  '0912000001', 'lan.nguyen@sciencehub.test'),
  ('Trần Văn Hùng',   '0912000002', 'hung.tran@sciencehub.test'),
  ('Lê Minh Châu',    '0912000003', 'chau.le@sciencehub.test');

-- ---------------------------------------------------------------------
-- 2. Phụ huynh (6). Phụ huynh Nguyễn Văn Minh có 2 con cùng học.
-- ---------------------------------------------------------------------
insert into public.parents (full_name, phone) values
  ('Nguyễn Văn Minh', '0901000001'),
  ('Trần Thị Hoa',    '0901000002'),
  ('Lê Quốc Dũng',    '0901000003'),
  ('Phạm Thị Mai',    '0901000004'),
  ('Hoàng Văn Nam',   '0901000005'),
  ('Đặng Thị Thu',    '0901000006');

-- ---------------------------------------------------------------------
-- 3. Học sinh (8). Khối (grade) được trigger tự gán khi ghi danh.
--    Vũ Hải Đăng chưa có thông tin phụ huynh.
-- ---------------------------------------------------------------------
insert into public.students (full_name, phone, parent_id) values
  ('Nguyễn Minh Anh',  '0987000001', (select id from public.parents where phone = '0901000001')),
  ('Nguyễn Minh Khôi', null,         (select id from public.parents where phone = '0901000001')),
  ('Trần Bảo Ngọc',    '0987000003', (select id from public.parents where phone = '0901000002')),
  ('Lê Gia Huy',       '0987000004', (select id from public.parents where phone = '0901000003')),
  ('Phạm Tuấn Kiệt',   null,         (select id from public.parents where phone = '0901000004')),
  ('Hoàng Thu Trang',  '0987000006', (select id from public.parents where phone = '0901000005')),
  ('Đặng Quang Vinh',  '0987000007', (select id from public.parents where phone = '0901000006')),
  ('Vũ Hải Đăng',      '0987000008', null);

-- ---------------------------------------------------------------------
-- 4. Lớp học (5). Cặp lớp cùng giáo viên để thử Học bù:
--      Lan : Toan_9_Lan_1 (khối 9) và Toan_12_Lan_1 (khối 12)
--      Hùng: VatLi_9_Hung_1 (khối 9) và VatLi_12_Hung_1 (khối 12)
--    Anh_8_Chau_1 sẽ không còn học sinh đang học => thử được ẩn lớp.
-- ---------------------------------------------------------------------
insert into public.classes (name, subject, grade, class_no, teacher_id, price_per_session)
select v.name, v.subject, v.grade, v.class_no, t.id, v.price
from (values
  ('Toan_9_Lan_1',    'Toán',   9,  1, '0912000001', 150000),
  ('VatLi_9_Hung_1',  'Vật Lí', 9,  1, '0912000002', 120000),
  ('Anh_8_Chau_1',    'Anh',    8,  1, '0912000003', 100000),
  ('Toan_12_Lan_1',   'Toán',   12, 1, '0912000001', 150000),
  ('VatLi_12_Hung_1', 'Vật Lí', 12, 1, '0912000002', 120000)
) as v(name, subject, grade, class_no, teacher_phone, price)
join public.teachers t on t.phone = v.teacher_phone;

-- ---------------------------------------------------------------------
-- 5. Lịch học (class_schedules): 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật
-- ---------------------------------------------------------------------
insert into public.class_schedules (class_id, day_of_week, start_time, end_time)
select c.id, v.day_of_week, v.start_time::time, v.end_time::time
from (values
  ('Toan_9_Lan_1',    2, '17:30', '19:00'),
  ('Toan_9_Lan_1',    4, '17:30', '19:00'),
  ('Toan_9_Lan_1',    6, '17:30', '19:00'),
  ('VatLi_9_Hung_1',  3, '19:00', '20:30'),
  ('VatLi_9_Hung_1',  5, '19:00', '20:30'),
  ('Anh_8_Chau_1',    2, '18:00', '19:30'),
  ('Anh_8_Chau_1',    4, '18:00', '19:30'),
  ('Toan_12_Lan_1',   7, '08:00', '10:00'),
  ('Toan_12_Lan_1',   8, '08:00', '10:00'),
  ('VatLi_12_Hung_1', 3, '19:00', '20:30'),
  ('VatLi_12_Hung_1', 5, '19:00', '20:30')
) as v(class_name, day_of_week, start_time, end_time)
join public.classes c on c.name = v.class_name;

-- ---------------------------------------------------------------------
-- 6. Ghi danh (tất cả vào lớp bằng trạng thái 'active')
--    - Nguyễn Minh Anh học 2 lớp khối 9 (Toan_9_Lan_1 + VatLi_9_Hung_1): thử học phí đa môn.
--    - Hoàng Thu Trang, Đặng Quang Vinh học 2 lớp khối 12 (Toán + Vật Lí).
--    - Lê Gia Huy vào Toan_9_Lan_1 ngày 05/10/2026: học sinh mới trong tháng 10.
--    - Vũ Hải Đăng sẽ nghỉ Anh_8_Chau_1 ngày 12/10/2026 (xem mục 8).
-- ---------------------------------------------------------------------
insert into public.class_enrollments (class_id, student_id, status, joined_at)
select c.id, s.id, 'active', v.joined_at::date
from (values
  ('Toan_9_Lan_1',    'Nguyễn Minh Anh',  '2026-09-01'),
  ('Toan_9_Lan_1',    'Trần Bảo Ngọc',    '2026-09-01'),
  ('Toan_9_Lan_1',    'Phạm Tuấn Kiệt',   '2026-09-01'),
  ('Toan_9_Lan_1',    'Lê Gia Huy',       '2026-10-05'),
  ('VatLi_9_Hung_1',  'Nguyễn Minh Anh',  '2026-09-01'),
  ('Anh_8_Chau_1',    'Vũ Hải Đăng',      '2026-09-01'),
  ('Toan_12_Lan_1',   'Nguyễn Minh Khôi', '2026-09-01'),
  ('Toan_12_Lan_1',   'Hoàng Thu Trang',  '2026-09-01'),
  ('Toan_12_Lan_1',   'Đặng Quang Vinh',  '2026-09-01'),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang',  '2026-09-01'),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh',  '2026-09-01')
) as v(class_name, student_name, joined_at)
join public.classes  c on c.name = v.class_name
join public.students s on s.full_name = v.student_name;

-- ---------------------------------------------------------------------
-- 7. Điểm danh tháng 9 và tháng 10/2026
--    present = Có mặt (tính tiền), absent = Vắng (tính tiền),
--    absent_excused = Vắng có phép (không tính tiền, price_snapshot trống).
--    Các ngày đều khớp lịch lớp. Toan_12_Lan_1 chưa điểm danh các cuối tuần
--    sau 11/10/2026 để thử điểm danh mới.
-- ---------------------------------------------------------------------
insert into public.attendance_records
  (enrollment_id, class_id, student_id, attendance_date, status, price_snapshot)
select e.id, e.class_id, e.student_id, v.d::date, v.st, v.price::integer
from (values
  -- Toan_9_Lan_1 (Thứ 2/4/6): tháng 9 giá đóng băng 100.000đ, tháng 10 là 150.000đ
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-09-02', 'present',        100000),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-09-04', 'present',        100000),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-09-07', 'absent_excused', null),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-09-09', 'present',        100000),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-10-02', 'present',        150000),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-10-05', 'present',        150000),
  ('Toan_9_Lan_1', 'Nguyễn Minh Anh', '2026-10-07', 'absent',         150000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-09-02', 'present',        100000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-09-04', 'absent',         100000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-09-07', 'present',        100000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-09-09', 'present',        100000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-10-02', 'present',        150000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-10-05', 'present',        150000),
  ('Toan_9_Lan_1', 'Trần Bảo Ngọc',   '2026-10-07', 'present',        150000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-09-02', 'present',        100000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-09-04', 'present',        100000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-09-07', 'present',        100000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-09-09', 'absent_excused', null),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-10-02', 'present',        150000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-10-05', 'present',        150000),
  ('Toan_9_Lan_1', 'Phạm Tuấn Kiệt',  '2026-10-07', 'present',        150000),
  ('Toan_9_Lan_1', 'Lê Gia Huy',      '2026-10-05', 'present',        150000),
  ('Toan_9_Lan_1', 'Lê Gia Huy',      '2026-10-07', 'present',        150000),
  -- VatLi_9_Hung_1 (Thứ 3/5): giá 120.000đ
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-09-01', 'present',        120000),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-09-03', 'present',        120000),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-09-08', 'present',        120000),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-09-10', 'absent_excused', null),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-10-01', 'present',        120000),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-10-06', 'present',        120000),
  ('VatLi_9_Hung_1', 'Nguyễn Minh Anh', '2026-10-08', 'present',        120000),
  -- VatLi_12_Hung_1 (Thứ 3/5): giá 120.000đ
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-09-01', 'present',        120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-09-03', 'absent',         120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-09-08', 'present',        120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-09-10', 'present',        120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-10-01', 'present',        120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-10-06', 'present',        120000),
  ('VatLi_12_Hung_1', 'Hoàng Thu Trang', '2026-10-08', 'absent_excused', null),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-09-01', 'present',        120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-09-03', 'present',        120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-09-08', 'present',        120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-09-10', 'present',        120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-10-01', 'present',        120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-10-06', 'absent',         120000),
  ('VatLi_12_Hung_1', 'Đặng Quang Vinh', '2026-10-08', 'present',        120000),
  -- Anh_8_Chau_1 (Thứ 2/4): Vũ Hải Đăng học trước khi nghỉ ngày 12/10/2026
  ('Anh_8_Chau_1', 'Vũ Hải Đăng', '2026-09-02', 'present',        100000),
  ('Anh_8_Chau_1', 'Vũ Hải Đăng', '2026-09-07', 'present',        100000),
  ('Anh_8_Chau_1', 'Vũ Hải Đăng', '2026-09-09', 'absent_excused', null),
  ('Anh_8_Chau_1', 'Vũ Hải Đăng', '2026-10-05', 'present',        100000),
  ('Anh_8_Chau_1', 'Vũ Hải Đăng', '2026-10-07', 'present',        100000),
  -- Toan_12_Lan_1 (Thứ 7/Chủ nhật): giá 150.000đ
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-09-05', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-09-06', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-09-12', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-09-13', 'absent_excused', null),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-10-03', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-10-04', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-10-10', 'present',        150000),
  ('Toan_12_Lan_1', 'Nguyễn Minh Khôi', '2026-10-11', 'present',        150000),
  ('Toan_12_Lan_1', 'Hoàng Thu Trang',  '2026-09-05', 'present',        150000),
  ('Toan_12_Lan_1', 'Hoàng Thu Trang',  '2026-09-06', 'present',        150000),
  ('Toan_12_Lan_1', 'Hoàng Thu Trang',  '2026-09-12', 'absent',         150000),
  ('Toan_12_Lan_1', 'Hoàng Thu Trang',  '2026-10-03', 'present',        150000),
  ('Toan_12_Lan_1', 'Hoàng Thu Trang',  '2026-10-04', 'present',        150000),
  ('Toan_12_Lan_1', 'Đặng Quang Vinh',  '2026-09-05', 'present',        150000),
  ('Toan_12_Lan_1', 'Đặng Quang Vinh',  '2026-09-06', 'present',        150000),
  ('Toan_12_Lan_1', 'Đặng Quang Vinh',  '2026-10-03', 'present',        150000),
  ('Toan_12_Lan_1', 'Đặng Quang Vinh',  '2026-10-04', 'absent',         150000)
) as v(class_name, student_name, d, st, price)
join public.classes  c on c.name = v.class_name
join public.students s on s.full_name = v.student_name
join public.class_enrollments e on e.class_id = c.id and e.student_id = s.id;

-- ---------------------------------------------------------------------
-- 8. Cho Vũ Hải Đăng nghỉ lớp Anh_8_Chau_1 ngày 12/10/2026
--    UPDATE (không INSERT thẳng 'dropped') để trigger tự ẩn học sinh khi
--    hết lớp đang học. Anh_8_Chau_1 không còn học sinh => thử ẩn lớp được.
-- ---------------------------------------------------------------------
update public.class_enrollments e
set status = 'dropped', left_at = date '2026-10-12'
from public.classes c, public.students s
where e.class_id = c.id and e.student_id = s.id
  and c.name = 'Anh_8_Chau_1'
  and s.full_name = 'Vũ Hải Đăng'
  and e.status = 'active';

notify pgrst, 'reload schema';
