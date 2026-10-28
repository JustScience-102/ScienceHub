-- =====================================================================
-- Trung tâm ScienceHub - DỌN DỮ LIỆU THỬ (TÙY CHỌN, CHỈ CHẠY MỘT LẦN TRƯỚC KHI NHẬP DỮ LIỆU THẬT)
--
-- File này XÓA VĨNH VIỄN toàn bộ dữ liệu nghiệp vụ: phụ huynh, học sinh, lớp, lịch học, ghi danh,
-- điểm danh, giáo viên, tài khoản giáo viên (bảng profiles) và nhật ký thay đổi.
-- GIỮ LẠI tài khoản Quản lý trong profiles. Mã HS/PH được đặt lại về HS0001 / PH0001.
-- KHÔNG xóa người dùng trong Supabase Authentication: hãy xóa tay các tài khoản giáo viên thử
-- ở mục Authentication > Users nếu không dùng nữa.
--
-- Trước khi chạy:
--   1. Vào Tổng quan > Sao lưu & Năm học, tải thử 1 bản sao lưu toàn hệ thống (.json).
--   2. Xóa đoạn "KHÓA AN TOÀN" ngay bên dưới, rồi chạy cả file trong Supabase SQL Editor.
-- =====================================================================

-- ===== KHÓA AN TOÀN: xóa khối DO này thì file mới chạy được =====
do $$
begin
  raise exception 'Trung tâm: File này xóa toàn bộ dữ liệu. Hãy đọc kỹ phần chú thích đầu file, tải bản sao lưu, rồi xóa khối "KHÓA AN TOÀN" để chạy.';
end $$;
-- ===== HẾT KHÓA AN TOÀN =====

begin;

  -- Cho phép xóa nhật ký trong giao dịch này (cờ chỉ có hiệu lực trong giao dịch hiện tại).
  select set_config('sciencehub.allow_audit_clear', 'on', true);

  delete from public.attendance_records;
  delete from public.class_enrollments;
  delete from public.class_schedules;
  delete from public.classes;
  delete from public.students;
  delete from public.parents;
  delete from public.profiles where role = 'teacher';
  delete from public.teachers;

  -- Xóa nhật ký sau cùng để gom luôn các dòng nhật ký phát sinh từ việc dọn dữ liệu ở trên.
  delete from public.audit_log;

  alter sequence public.parent_code_seq  restart with 1;
  alter sequence public.student_code_seq restart with 1;

  select set_config('sciencehub.allow_audit_clear', 'off', true);

commit;
