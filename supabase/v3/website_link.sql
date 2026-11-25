-- =====================================================================
-- Lớp học ScienceHub V3 - TẠO TÀI KHOẢN CSDL "website_link" CHO TRANG GIỚI THIỆU (site/)
-- Chạy MỘT LẦN trong SQL Editor, TRƯỚC 11_website.sql. Chạy lại để đổi mật khẩu.
-- Đây là bản mẫu: thay DOI_MAT_KHAU (2 chỗ) bằng mật khẩu dài ngẫu nhiên. KHÔNG đưa mật khẩu thật lên git.
--
-- Tài khoản chỉ đăng nhập được, không có quyền gì trên schema public; 11_website.sql cấp cho nó đúng các hàm
-- trong schema "website". Trang giới thiệu dùng chuỗi Transaction pooler (cổng 6543) với người dùng
-- "website_link.<mã project>", đặt ở biến môi trường WEBSITE_DATABASE_URL của dự án Vercel "site".
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'website_link') then
    create role website_link login password 'DOI_MAT_KHAU'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 20;
  else
    alter role website_link with login password 'DOI_MAT_KHAU';
  end if;
end $$;

-- Mỗi truy vấn của trang giới thiệu tối đa 5 giây.
alter role website_link set statement_timeout = '5s';
