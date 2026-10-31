-- ============================================================
--  v14: 여러 파일 업로드(zip 다운로드) + 회원 그룹 + 그룹별 다운로드 허용
--
--  1) mh_files.main_files / solution_files  — 문제·해설 PDF 를 여러 장 올릴 때의 파일 목록 [{p:'main_2.pdf', n:'원래이름.pdf'}]
--       비어 있으면(기본) 예전처럼 PDF 한 장(main.pdf / solution.pdf)이에요.
--  2) mh_groups / mh_group_members          — 그룹 이름, 그룹에 속한 회원
--  3) mh_files.allow_groups                 — 비어 있으면 제한 없음(기본). 값이 있으면 그 그룹 회원 + 직원만 받을 수 있어요.
--       ※ 그룹 제한은 "추가 조건"이에요: 그룹 회원이어도 무료가 아니면 구매/M패스는 필요해요.
--         (우리 반만 무료로 주려면: 가격 0 + 그룹 지정)
--  4) 받기 권한 3곳에 그룹 조건을 끼워요: mh_can_download(변환 서버) · mh_can_read_object(저장소) · mh_premium_read(드라이브 ID)
--     + 그룹 밖 회원이 구매·M패스로 포인트를 쓰지 않게 mh_buy_file / mh_claim_file 도 막아요.
--
--  여러 번 실행해도 안전해요. 예전 DB 에 그대로 덧붙이면 돼요.
-- ============================================================

-- 1) 파일 목록 / 허용 그룹 칸
alter table public.mh_files add column if not exists main_files     jsonb not null default '[]'::jsonb;
alter table public.mh_files add column if not exists solution_files jsonb not null default '[]'::jsonb;
alter table public.mh_files add column if not exists allow_groups   uuid[] not null default '{}';

-- 2) 그룹
create table if not exists public.mh_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index if not exists mh_groups_name_uq on public.mh_groups (lower(btrim(name)));

create table if not exists public.mh_group_members (
  group_id uuid not null references public.mh_groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists mh_group_members_user on public.mh_group_members (user_id);

alter table public.mh_groups enable row level security;
alter table public.mh_group_members enable row level security;

-- 그룹 목록: 회원 관리 / 자료 관리 직원 + 자기가 속한 그룹. 만들기·고치기·지우기: 관리자 + 회원 관리 직원
drop policy if exists mh_groups_read on public.mh_groups;
create policy mh_groups_read on public.mh_groups for select
  using (public.mh_is_admin() or public.staff_can('members') or public.staff_can('content')
         or exists (select 1 from public.mh_group_members m where m.group_id = mh_groups.id and m.user_id = auth.uid()));
drop policy if exists mh_groups_write on public.mh_groups;
create policy mh_groups_write on public.mh_groups for all
  using (public.mh_is_admin() or public.staff_can('members'))
  with check (public.mh_is_admin() or public.staff_can('members'));

-- 그룹 회원: 내 것은 누구나 볼 수 있고(자료 잠금 표시용), 전체는 관리 직원만
drop policy if exists mh_group_members_read on public.mh_group_members;
create policy mh_group_members_read on public.mh_group_members for select
  using (user_id = auth.uid() or public.mh_is_admin() or public.staff_can('members'));
drop policy if exists mh_group_members_write on public.mh_group_members;
create policy mh_group_members_write on public.mh_group_members for all
  using (public.mh_is_admin() or public.staff_can('members'))
  with check (public.mh_is_admin() or public.staff_can('members'));

-- 3) "이 자료의 그룹 조건을 내가 만족하나?" (제한이 없으면 true). 직원 예외는 부르는 쪽에서 처리해요.
create or replace function public.mh_in_groups(p_file uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select cardinality(f.allow_groups) = 0
        or exists (select 1 from public.mh_group_members m
                    where m.user_id = auth.uid() and m.group_id = any (f.allow_groups))
      from public.mh_files f where f.id = p_file
  ), false)
$$;
revoke all on function public.mh_in_groups(uuid) from public;
grant execute on function public.mh_in_groups(uuid) to anon, authenticated;

-- 4-a) 변환 서버용 다운로드 권한 (v13 + 그룹 조건)
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
  if not public.mh_in_groups(p_file) then return false; end if;
  if v_tier = 'free' then return true; end if;
  return public.mh_owns(p_file);
end;
$$;

-- 4-b) 저장소 읽기 규칙 (v13 + 그룹 조건). main_2.pdf · solution_3.pdf 같은 여러 장 파일도 main/solution 과 같은 규칙이에요.
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
  if lower(p_name) like '%.json' or split_part(p_name, '/', 2) = 'img' then return false; end if;
  v_kind := split_part(split_part(p_name, '/', 2), '.', 1);
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = v_id;
  if not found or not v_visible then return false; end if;
  if v_kind = 'preview' then return true; end if;
  if not public.mh_in_groups(v_id) then return false; end if;
  if v_tier = 'free' then return true; end if;
  return public.mh_owns(v_id);
end;
$$;

-- 4-c) 드라이브 파일 ID(mh_premium): 그룹 조건을 만족해야 읽혀요
drop policy if exists mh_premium_read on public.mh_premium;
create policy mh_premium_read on public.mh_premium for select
  using (
    public.mh_is_admin()
    or (
      exists (select 1 from public.mh_files f where f.id = mh_premium.file_id and f.visible)
      and public.mh_in_groups(mh_premium.file_id)
      and (public.mh_owns(mh_premium.file_id)
           or exists (select 1 from public.mh_files f where f.id = mh_premium.file_id and f.tier = 'free'))
    )
  );

-- 4-d) 구매 / M패스로 받기: 그룹 밖이면 포인트·건수를 쓰기 전에 막아요
create or replace function public.mh_buy_file(p_file uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_price int; v_title text; v_visible boolean;
  v_name text; v_status text; v_bal int;
begin
  if v_uid is null then return 'login'; end if;
  select p.username, p.status into v_name, v_status from public.profiles p where p.id = v_uid;
  if v_status = 'rejected' then return 'blocked'; end if;
  select f.price, f.title, f.visible into v_price, v_title, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return 'not_found'; end if;
  if public.mh_is_admin() or public.mh_owns(p_file) then return 'already'; end if;
  if not public.staff_can('content') and not public.mh_in_groups(p_file) then return 'group_only'; end if;
  if v_price <= 0 then return 'not_for_sale'; end if;

  insert into public.mh_points (user_id, username, balance) values (v_uid, coalesce(v_name, ''), 0)
    on conflict (user_id) do nothing;
  select balance into v_bal from public.mh_points where user_id = v_uid for update;
  if v_bal < v_price then return 'insufficient'; end if;

  update public.mh_points set balance = balance - v_price, updated_at = now() where user_id = v_uid;
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, v_price)
    on conflict (user_id, file_id) do update
      set price = excluded.price, created_at = now(), expires_at = now() + interval '30 days';
  delete from public.mh_dl where user_id = v_uid and file_id = p_file;
  insert into public.mh_ledger (user_id, username, delta, balance_after, kind, file_id, memo)
    values (v_uid, coalesce(v_name, ''), -v_price, v_bal - v_price, 'purchase', p_file, left(v_title, 120));
  return 'ok';
end $$;

create or replace function public.mh_claim_file(p_file uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_tier text; v_visible boolean; v_row public.mh_pass%rowtype;
begin
  if v_uid is null then return 'login'; end if;
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return 'not_found'; end if;
  if not public.mh_is_admin() and not public.staff_can('content') and not public.mh_in_groups(p_file) then return 'group_only'; end if;
  if v_tier = 'free' then return 'free'; end if;
  if public.mh_is_admin() or public.mh_owns(p_file) then return 'already'; end if;
  select * into v_row from public.mh_pass m where m.user_id = v_uid for update;
  if not found or not v_row.active
     or (v_row.expires is not null and v_row.expires < (now() at time zone 'Asia/Seoul')::date) then
    return 'no_pass';
  end if;
  if v_row.used >= v_row.quota then return 'no_quota'; end if;
  update public.mh_pass set used = used + 1, updated_at = now() where user_id = v_uid;
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, 0)
    on conflict (user_id, file_id) do update
      set price = 0, created_at = now(), expires_at = now() + interval '30 days';
  delete from public.mh_dl where user_id = v_uid and file_id = p_file;
  return 'ok';
end $$;

-- 5) 자료가 쓰고 있는 그룹은 지울 수 없어요 (지우면 그 자료가 조용히 "제한 없음"이 돼 버리니까)
create or replace function public.mh_group_guard_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.mh_files f where old.id = any (f.allow_groups)) then
    raise exception 'group_in_use' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
drop trigger if exists mh_group_guard on public.mh_groups;
create trigger mh_group_guard before delete on public.mh_groups
  for each row execute function public.mh_group_guard_delete();
