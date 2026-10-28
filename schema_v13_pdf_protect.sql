-- ============================================================
--  v13: PDF 보호 — 원본 JSON · 그림을 서버(워터마크)를 거치지 않고 직접 받는 길을 막아요
--
--  배경
--    구매한 사람은 지금 Supabase 저장소 API 로 {자료}/main.json · solution.json · img/* 를 직접 읽을 수 있어요.
--    그러면 변환 서버가 찍는 워터마크를 건너뛰고 원본으로 새 PDF 를 만들 수 있어요.
--
--  바꾸는 것
--    1) mh_can_download(파일, 종류)  — 새 함수. 변환 서버가 "이 사람이 이 자료를 받아도 되나?" 물을 때 써요.
--       규칙은 예전과 똑같아요: 무료 자료 / 구매·M패스로 받은 자료(30일) / 직원
--    2) mh_can_read_object(이름)     — 저장소 읽기 규칙. .json 과 img/ 는 직원만 읽게 → 구매자는 직접 못 읽어요.
--       (변환 서버는 서비스 키로 읽으니까 영향 없어요. 업로드 PDF(main.pdf 등) · 미리보기 규칙은 그대로예요)
--
--  순서
--    ① 변환 서버를 먼저 배포 (예전 DB 에서도 동작해요)  →  ② 이 SQL 을 SQL Editor 에서 실행.  여러 번 실행해도 안전해요.
--
--  확인 (실행 후)
--    - 구매자 계정으로 PDF 받기  → 워터마크 PDF 가 받아져요
--    - 구매자 계정의 브라우저 콘솔에서 sb.storage.from('mh-files').createSignedUrl('<자료id>/main.json', 60)  → 오류(권한 없음)
-- ============================================================

-- 1) 변환 서버용 다운로드 권한
create or replace function public.mh_can_download(p_file uuid, p_kind text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tier text;
  v_visible boolean;
begin
  if p_kind not in ('main', 'solution') then return false; end if;
  if public.mh_is_admin() or public.staff_can('content') then return true; end if;
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return false; end if;
  if v_tier = 'free' then return true; end if;
  return public.mh_owns(p_file);
end;
$$;
revoke all on function public.mh_can_download(uuid, text) from public;
grant execute on function public.mh_can_download(uuid, text) to anon, authenticated;

-- 2) 저장소 읽기 규칙: 원본 JSON · 그림은 직원만
create or replace function public.mh_can_read_object(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
  v_tier text;
  v_visible boolean;
begin
  if public.mh_is_admin() or public.staff_can('content') then return true; end if;
  begin
    v_id := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  -- 원본 JSON · 그림은 변환 서버(서비스 키)만 읽어요. 구매자는 PDF(워터마크 포함)로만 받아요.
  if lower(p_name) like '%.json' or split_part(p_name, '/', 2) = 'img' then return false; end if;
  v_kind := split_part(split_part(p_name, '/', 2), '.', 1);
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = v_id;
  if not found or not v_visible then return false; end if;
  if v_kind = 'preview' then return true; end if;
  if v_tier = 'free' then return true; end if;
  return public.mh_owns(v_id);
end;
$$;
