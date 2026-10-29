-- =====================================================================
-- Trung tâm ScienceHub V3 - FILE 03: TÊN LỚP DO DATABASE TỰ SINH
-- Chạy sau 02_security.sql. Chạy lại an toàn.
--
-- Quy tắc (đã chốt với Trung tâm):
--   * Tên lớp = MônKhôngDấu_Khối_TênGọiGV_STT, ví dụ VatLi_12_Nam_1. Trình duyệt không gửi tên lên.
--   * Tên gọi GV = từ cuối của họ tên, bỏ dấu, viết hoa chữ đầu ("Nguyễn Thị Lan" -> "Lan"),
--     giống hệt hàm subjectToken/teacherToken của frontend (src/lib/className.js).
--   * Hai giáo viên trùng tên gọi (Lam / Lâm) cùng TỪNG dạy một môn (kể cả lớp đã ẩn và lịch sử lớp)
--     thì cả hai thêm chữ theo thứ tự được thêm vào Trung tâm: LamA, LamB, ... Khác môn thì không thêm.
--   * Tên luôn tính từ dữ liệu hiện tại: sửa họ tên giáo viên thì tên lớp và nhãn trong lịch sử lớp
--     (view class_versions_labeled) đều đổi theo.
-- =====================================================================

-- Bỏ dấu giống normalizeText của frontend (NFD bỏ dấu + đ -> d), không cần extension unaccent.
create or replace function public._vn_unaccent(p_text text)
returns text
language sql
immutable
as $$
  select translate(coalesce(p_text, ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳḀḁḂḃḄḅḆḇḈḉḊḋḌḍḎḏḐḑḒḓḔḕḖḗḘḙḚḛḜḝḞḟḠḡḢḣḤḥḦḧḨḩḪḫḬḭḮḯḰḱḲḳḴḵḶḷḸḹḺḻḼḽḾḿṀṁṂṃṄṅṆṇṈṉṊṋṌṍṎṏṐṑṒṓṔṕṖṗṘṙṚṛṜṝṞṟṠṡṢṣṤṥṦṧṨṩṪṫṬṭṮṯṰṱṲṳṴṵṶṷṸṹṺṻṼṽṾṿẀẁẂẃẄẅẆẇẈẉẊẋẌẍẎẏẐẑẒẓẔẕẖẗẘẙẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZzOoUuAaIiOoUuUuUuUuUuAaAaGgKkOoOojGgNnAaAaAaEeEeIiIiOoOoRrRrUuUuSsTtHhAaEeOoOoOoOoYyAaBbBbBbCcDdDdDdDdDdEeEeEeEeEeFfGgHhHhHhHhHhIiIiKkKkKkLlLlLlLlMmMmMmNnNnNnNnOoOoOoOoPpPpRrRrRrRrSsSsSsSsSsTtTtTtTtUuUuUuUuUuVvVvWwWwWwWwWwXxXxYyZzZzZzhtwyAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIiOoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuYyYyYyYy');
$$;

-- Một từ: bỏ dấu, chữ thường, viết hoa chữ đầu ("lâm" -> "Lam")
create or replace function public._name_word(p_word text)
returns text
language sql
immutable
as $$
  select upper(left(w, 1)) || substr(w, 2)
  from (select lower(public._vn_unaccent(btrim(coalesce(p_word, '')))) as w) x;
$$;

-- "Vật Lí" -> "VatLi", "Khoa học tự nhiên" -> "KhoaHocTuNhien"
create or replace function public._subject_token(p_subject text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(public._name_word(t.w), '' order by t.ord), '')
  from regexp_split_to_table(btrim(coalesce(p_subject, '')), '\s+') with ordinality as t(w, ord)
  where t.w <> '';
$$;

-- "Nguyễn Thị Lan" -> "Lan"
create or replace function public._teacher_base_token(p_full_name text)
returns text
language sql
immutable
as $$
  select public._name_word(parts[cardinality(parts)])
  from (select regexp_split_to_array(btrim(coalesce(p_full_name, '')), '\s+') as parts) x;
$$;

-- Tên gọi của giáo viên trong một môn, có thêm chữ A/B/... khi trùng với giáo viên khác cùng môn.
-- "Cùng môn" = từng có lớp môn đó (lớp đang có hoặc đã ẩn, hoặc trong lịch sử lớp), luôn tính cả chính
-- giáo viên đang xét. Thứ tự chữ theo thời điểm thêm giáo viên vào Trung tâm.
create or replace function public._teacher_subject_token(p_teacher_id uuid, p_subject text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with taught as (
    select c.teacher_id from public.classes c where c.subject = p_subject
    union
    select v.teacher_id from public.class_versions v where v.subject = p_subject and v.teacher_id is not null
    union
    select p_teacher_id
  ),
  base as (
    select t.id, t.created_at, public._teacher_base_token(t.full_name) as token
    from public.teachers t
    where t.id in (select teacher_id from taught)
  ),
  grp as (
    select b.id, b.token,
           row_number() over (order by b.created_at, b.id) as rn,
           count(*) over () as n
    from base b
    where b.token = (select token from base where id = p_teacher_id)
  )
  select g.token || case
           when g.n <= 1 then ''
           when g.rn <= 26 then chr(64 + g.rn::integer)
           else g.rn::text
         end
  from grp g
  where g.id = p_teacher_id;
$$;

-- Tên lớp từ các phần cấu trúc. Trả về NULL nếu thiếu phần nào (chỉ xảy ra với lịch sử cũ).
create or replace function public.class_name_for(
  p_subject    text,
  p_grade      integer,
  p_teacher_id uuid,
  p_class_no   integer
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select public._subject_token(p_subject) || '_' || p_grade::text || '_'
         || public._teacher_subject_token(p_teacher_id, p_subject) || '_' || p_class_no::text
  where p_subject is not null and p_grade is not null and p_teacher_id is not null and p_class_no is not null;
$$;

-- Tên giáo viên để hiển thị trong lịch sử lớp (Giáo viên đọc được tên đồng nghiệp từng dạy lớp mình).
create or replace function public.teacher_display_name(p_teacher_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.full_name from public.teachers t where t.id = p_teacher_id;
$$;

-- STT nhỏ nhất còn trống cho (môn, khối, giáo viên) giữa các lớp đang hiển thị, bỏ qua lớp p_except.
create or replace function public._next_class_no(
  p_subject    text,
  p_grade      integer,
  p_teacher_id uuid,
  p_except     uuid default null
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select min(n)::integer
  from generate_series(1, 1000) as n
  where not exists (
    select 1 from public.classes c
    where c.deleted_at is null
      and c.subject = p_subject and c.grade = p_grade and c.teacher_id = p_teacher_id
      and c.class_no = n
      and (p_except is null or c.id <> p_except)
  );
$$;

-- Tính lại tên mọi lớp (của các môn được chỉ định, NULL = tất cả). Chỉ cập nhật lớp có tên đổi.
-- Sau khi tính, các lớp đang hiển thị phải có tên khác nhau (luôn đúng theo cấu trúc; kiểm để chắc chắn).
create or replace function public._refresh_class_names(p_subjects text[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_dup   text;
begin
  with pairs as (
    select distinct c.teacher_id, c.subject
    from public.classes c
    where p_subjects is null or c.subject = any (p_subjects)
  ),
  tokens as (
    select p.teacher_id, p.subject, public._teacher_subject_token(p.teacher_id, p.subject) as token
    from pairs p
  ),
  target as (
    select c.id,
           public._subject_token(c.subject) || '_' || c.grade::text || '_' || t.token || '_' || c.class_no::text as new_name
    from public.classes c
    join tokens t on t.teacher_id = c.teacher_id and t.subject = c.subject
  )
  update public.classes c
  set name = t.new_name
  from target t
  where t.id = c.id and c.name is distinct from t.new_name;
  get diagnostics v_count = row_count;

  select min(c.name) into v_dup
  from public.classes c
  where c.deleted_at is null
  group by lower(c.name)
  having count(*) > 1
  limit 1;
  if v_dup is not null then
    raise exception 'Trung tâm: Tên lớp % bị trùng giữa hai lớp đang hiển thị. Hãy kiểm tra môn học và giáo viên của các lớp này.', v_dup;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger: tên của chính lớp được tính trước khi ghi; các lớp khác cùng môn (có thể phải thêm chữ A/B)
-- được tính lại sau câu lệnh. Sửa họ tên giáo viên thì tính lại mọi lớp.
-- ---------------------------------------------------------------------
create or replace function public._trg_classes_set_name()
returns trigger
language plpgsql
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  new.name := public.class_name_for(new.subject, new.grade, new.teacher_id, new.class_no);
  return new;
end;
$$;

drop trigger if exists trg_classes_set_name on public.classes;
create trigger trg_classes_set_name
  before insert or update of subject, grade, class_no, teacher_id on public.classes
  for each row execute function public._trg_classes_set_name();

create or replace function public._trg_classes_refresh_names_ins()
returns trigger
language plpgsql
as $$
declare
  v_subjects text[];
begin
  if public._is_restoring() then
    return null;
  end if;
  select array_agg(distinct n.subject) into v_subjects from new_rows n;
  if v_subjects is not null then
    perform public._refresh_class_names(v_subjects);
  end if;
  return null;
end;
$$;

create or replace function public._trg_classes_refresh_names_upd()
returns trigger
language plpgsql
as $$
declare
  v_subjects text[];
begin
  if public._is_restoring() then
    return null;
  end if;
  select array_agg(distinct s) into v_subjects
  from (
    select unnest(array[o.subject, n.subject]) as s
    from old_rows o
    join new_rows n on n.id = o.id
    where (o.subject, o.grade, o.class_no, o.teacher_id) is distinct from (n.subject, n.grade, n.class_no, n.teacher_id)
  ) x;
  if v_subjects is not null then
    perform public._refresh_class_names(v_subjects);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_classes_refresh_names_ins on public.classes;
create trigger trg_classes_refresh_names_ins
  after insert on public.classes
  referencing new table as new_rows
  for each statement execute function public._trg_classes_refresh_names_ins();

drop trigger if exists trg_classes_refresh_names_upd on public.classes;
create trigger trg_classes_refresh_names_upd
  after update on public.classes
  referencing old table as old_rows new table as new_rows
  for each statement execute function public._trg_classes_refresh_names_upd();

create or replace function public._trg_teachers_refresh_names()
returns trigger
language plpgsql
as $$
begin
  if public._is_restoring() then
    return new;
  end if;
  perform public._refresh_class_names(null);
  return new;
end;
$$;

drop trigger if exists trg_teachers_refresh_names on public.teachers;
create trigger trg_teachers_refresh_names
  after update of full_name on public.teachers
  for each row
  when (old.full_name is distinct from new.full_name)
  execute function public._trg_teachers_refresh_names();

-- ---------------------------------------------------------------------
-- Lịch sử nhãn lớp có tên tính lại theo dữ liệu hiện tại (RLS của class_versions vẫn áp dụng).
-- ---------------------------------------------------------------------
create or replace view public.class_versions_labeled
with (security_invoker = true) as
select v.id,
       v.class_id,
       coalesce(public.class_name_for(v.subject, v.grade, v.teacher_id, v.class_no), '') as name,
       v.subject,
       v.grade,
       v.class_no,
       v.teacher_id,
       public.teacher_display_name(v.teacher_id) as teacher_name,
       v.price_per_session,
       v.valid_from,
       v.valid_to,
       v.reason,
       v.batch_id,
       v.created_at
from public.class_versions v;

-- Nhãn của lớp tại một ngày: thời kỳ cũ nếu ngày nằm trong đó, không thì nhãn hiện tại.
-- Chạy bằng quyền người gọi nên RLS tự giới hạn (Giáo viên chỉ lớp của mình).
create or replace function public.class_label_on(p_class_id uuid, p_date date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object('name', v.name, 'subject', v.subject, 'grade', v.grade,
                                'class_no', v.class_no, 'teacher_name', v.teacher_name)
      from public.class_versions_labeled v
      where v.class_id = p_class_id and p_date between v.valid_from and v.valid_to
      order by v.valid_to desc
      limit 1
    ),
    (
      select jsonb_build_object('name', c.name, 'subject', c.subject, 'grade', c.grade,
                                'class_no', c.class_no, 'teacher_name', public.teacher_display_name(c.teacher_id))
      from public.classes c
      where c.id = p_class_id
    )
  );
$$;

-- Xem trước tên lớp cho form Thêm/Sửa lớp (đúng như Database sẽ đặt). p_class_no NULL = STT tự chọn.
create or replace function public.preview_class_name(
  p_class_id   uuid,
  p_subject    text,
  p_grade      integer,
  p_teacher_id uuid,
  p_class_no   integer default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role  text := public.assert_staff();
  v_no    integer;
  v_taken boolean := false;
begin
  if v_role = 'teacher' and p_teacher_id is distinct from public.current_teacher_id() then
    raise exception 'Trung tâm: Giáo viên chỉ được tạo hoặc chỉnh sửa lớp của chính mình.';
  end if;
  if coalesce(btrim(p_subject), '') = '' or p_grade is null or p_teacher_id is null then
    return jsonb_build_object('name', '', 'class_no', p_class_no, 'taken', false);
  end if;

  v_no := coalesce(p_class_no, public._next_class_no(btrim(p_subject), p_grade, p_teacher_id, p_class_id));
  v_taken := exists (
    select 1 from public.classes c
    where c.deleted_at is null and c.subject = btrim(p_subject) and c.grade = p_grade
      and c.teacher_id = p_teacher_id and c.class_no = v_no
      and (p_class_id is null or c.id <> p_class_id)
  );

  return jsonb_build_object(
    'name', public.class_name_for(btrim(p_subject), p_grade, p_teacher_id, v_no),
    'class_no', v_no,
    'taken', v_taken
  );
end;
$$;
