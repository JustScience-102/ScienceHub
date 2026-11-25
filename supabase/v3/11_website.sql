-- =====================================================================
-- Lớp học ScienceHub V3 - FILE 11: TRANG GIỚI THIỆU sciencehub.id.vn (thư mục site/)
-- Thứ tự chạy trong SQL Editor: website_link.sql (một lần, tạo tài khoản) -> file này -> 09_grants.sql.
-- Chạy lại an toàn.
--
-- Trang giới thiệu (dự án Vercel riêng) nối vào Database này bằng tài khoản CSDL "website_link" qua hàm máy chủ
-- (site/api/*), giống cách app giao bài dùng "sciencehub_link" (10_sciencehub.sql). Mọi thứ nằm trong schema riêng
-- "website" (PostgREST không mở); anon và authenticated không vào được; website_link không đọc được bảng nào của
-- schema public, chỉ gọi các hàm dưới đây.
--   * website.catalog(p_subjects): lớp đang hiển thị để phụ huynh xem lịch (môn, khối, STT, tên giáo viên, nhóm lớp
--     và phần, lịch đang áp dụng và lịch sắp áp dụng). KHÔNG trả đơn giá (học phí trên web theo quy định của
--     Trung tâm Chìa Khóa Vàng, site/src/data/fees.js), học sinh, phụ huynh, điểm danh, doanh thu.
-- =====================================================================

create schema if not exists website;
revoke all on schema website from public;

-- p_subjects: các môn cần lấy (so không phân biệt hoa thường); NULL = mọi môn.
-- schedules: mọi dòng lịch còn hiệu lực từ hôm nay (lịch hiện hành và lịch sắp áp dụng), kèm from/to để trang web
-- tách "lịch đang áp dụng" và "lịch mới từ ngày ..." theo đúng quy tắc thời kỳ (ARCHITECTURE.md mục 2.4).
create or replace function website.catalog(p_subjects text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'today', public.vn_today(),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'subject', c.subject,
          'grade', c.grade,
          'class_no', c.class_no,
          'teacher', t.full_name,
          'group', case when m.group_id is null then null
                        else jsonb_build_object('id', m.group_id, 'name', g.name, 'part', m.part_no) end,
          'schedules', coalesce((
            select jsonb_agg(jsonb_build_object(
                'day', s.day_of_week,
                'start', to_char(s.start_time, 'HH24:MI'),
                'end', to_char(s.end_time, 'HH24:MI'),
                'from', s.valid_from,
                'to', s.valid_to)
              order by s.valid_from nulls first, s.day_of_week, s.start_time)
            from public.class_schedules s
            where s.class_id = c.id
              and (s.valid_to is null or s.valid_to >= public.vn_today())), '[]'::jsonb))
        order by c.subject, c.grade, c.class_no)
      from public.classes c
      left join public.teachers t on t.id = c.teacher_id
      left join public.class_group_members m on m.class_id = c.id
      left join public.class_groups g on g.id = m.group_id
      where c.deleted_at is null
        and (p_subjects is null or lower(c.subject) in (select lower(x) from unnest(p_subjects) as x))), '[]'::jsonb)
  );
$$;
revoke all on function website.catalog(text[]) from public;

-- Tài khoản kết nối đã có (đã chạy website_link.sql) thì cấp quyền; chạy lại file này vẫn giữ đủ quyền.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'website_link') then
    grant usage on schema website to website_link;
    grant execute on function website.catalog(text[]) to website_link;
  end if;
end $$;

insert into public.schema_migrations (version, note)
values ('V3.2', 'Trang giới thiệu sciencehub.id.vn: schema website, website.catalog() (11_website.sql)')
on conflict (version) do nothing;
