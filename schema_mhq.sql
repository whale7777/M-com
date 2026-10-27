-- =====================================================================
-- v10: 민혁닷컴 JSON(mhq/1) 자료 + 저장공간 현황
--   * Supabase SQL Editor 에서 "schema.sql 전체"를 먼저 실행한 뒤 이 파일을 통째로 한 번 실행하세요.
--   * 여러 번 실행해도 안전해요. 기존 표·정책·데이터는 건드리지 않아요.
-- =====================================================================

-- 1) 문제/해설의 보관 방식에 'json' 추가 (JSON 파일 + 이미지로 올리고, 받을 때 서버가 PDF 로 변환)
alter table public.mh_files drop constraint if exists mh_files_main_src_check;
alter table public.mh_files add constraint mh_files_main_src_check check (main_src in ('drive', 'upload', 'json'));
alter table public.mh_files drop constraint if exists mh_files_solution_src_check;
alter table public.mh_files add constraint mh_files_solution_src_check check (solution_src in ('drive', 'upload', 'json'));

-- 2) 보관함(mh-files)에 JSON / 이미지도 올릴 수 있게
--    파일은  <자료id>/main.json  ·  <자료id>/img/<이름>.png|jpg|jpeg|svg  로 저장돼요.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/json', 'text/plain', 'image/png', 'image/jpeg', 'image/svg+xml'],
       file_size_limit = 10485760
 where id = 'mh-files';

-- 3) (관리자 전용) 저장공간 현황 — 관리자 › 💾 저장공간 탭이 이걸 불러요
create or replace function public.mh_storage_stats(p_recent int default 10)
returns jsonb
language plpgsql stable security definer set search_path = public, storage
as $$
declare
  v jsonb;
begin
  if not public.mh_is_admin() then
    raise exception 'admin only';
  end if;

  with o as (
    select name,
           split_part(name, '/', 1) as fid,
           coalesce((metadata->>'size')::bigint, 0) as bytes,
           created_at,
           case when name like '%/img/%' then 'img'
                when lower(name) like '%.json' then 'json'
                when lower(name) like '%.pdf' then 'pdf'
                else 'other' end as kind
      from storage.objects
     where bucket_id = 'mh-files'
  ),
  per as (            -- 자료 1개 = 폴더 1개
    select fid, sum(bytes) as bytes, min(created_at) as first_at,
           bool_or(kind = 'json') as is_json, count(*) as n
      from o group by fid
  ),
  recent as (
    select * from per order by first_at desc limit greatest(coalesce(p_recent, 10), 1)
  )
  select jsonb_build_object(
    'total_bytes',  coalesce((select sum(bytes) from o), 0),
    'object_count', (select count(*) from o),
    'set_count',    (select count(*) from per),
    'by_kind',      coalesce((select jsonb_object_agg(kind, b) from (select kind, sum(bytes) as b from o group by kind) k), '{}'::jsonb),
    'avg_json',     (select avg(bytes) from per where is_json),
    'avg_pdf',      (select avg(bytes) from per where not is_json),
    'json_sets',    (select count(*) from per where is_json),
    'pdf_sets',     (select count(*) from per where not is_json),
    'db_bytes',     pg_database_size(current_database()),
    -- 이 프로젝트의 "모든" 보관함 합계 (PyNest 등 같은 프로젝트를 쓰는 다른 보관함 포함 = Supabase 가 세는 스토리지 용량과 같은 기준)
    'all_bytes',    coalesce((select sum(coalesce((metadata->>'size')::bigint, 0)) from storage.objects), 0),
    'buckets',      coalesce((select jsonb_object_agg(bucket_id, b) from (select bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) as b from storage.objects group by bucket_id) x), '{}'::jsonb),
    'recent',       coalesce((
        select jsonb_agg(jsonb_build_object(
                 'file_id', r.fid, 'title', f.title, 'bytes', r.bytes, 'at', r.first_at, 'json', r.is_json, 'objects', r.n
               ) order by r.first_at desc)
          from recent r left join public.mh_files f on f.id::text = r.fid
      ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.mh_storage_stats(int) from public, anon;
grant execute on function public.mh_storage_stats(int) to authenticated;
