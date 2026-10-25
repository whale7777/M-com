-- =====================================================================
--  민혁닷컴 스키마 (v4 · M포인트 포함)
--  v3 를 이미 실행했어도 그대로 한 번 더 실행하면 업그레이드돼요.
--  PyNest와 "같은" Supabase 프로젝트의 SQL Editor 에서 실행하세요.
--  (PyNest 의 schema.sql 을 이미 실행해서 public.profiles 가 있어야 해요)
--  여러 번 실행해도 안전해요.
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles 테이블이 없어요. PyNest 와 같은 Supabase 프로젝트인지 확인해주세요.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
-- 과목·단원 구조(key=taxonomy), 사이트 설정(key=site)
create table if not exists public.mh_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 자료 목록 (무료 문제 PDF 의 드라이브 ID 만 여기 들어가요)
create table if not exists public.mh_files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default '',
  unit text not null default '',
  level int not null default 1 check (level between 1 and 3),
  tier text not null default 'free' check (tier in ('free', 'premium')),
  count int not null default 0,
  "desc" text not null default '',
  preview_id text not null default '',
  has_solution boolean not null default false,
  visible boolean not null default true,
  pinned boolean not null default false,
  downloads int not null default 0,
  drive_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 프리미엄 문제 PDF / 해설 PDF 의 드라이브 ID (M패스 보유자만 읽기)
create table if not exists public.mh_premium (
  file_id uuid primary key references public.mh_files(id) on delete cascade,
  drive_id text,
  solution_id text
);

-- M패스 명단 (PyNest 계정 기준)
create table if not exists public.mh_pass (
  user_id uuid primary key,
  username text not null,
  active boolean not null default true,
  expires date,
  memo text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 함수
-- ---------------------------------------------------------------------
-- 관리자(PyNest 선생님 계정)인가?
create or replace function public.mh_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved'
  );
$$;

-- 프리미엄을 받을 수 있는가? (관리자 / M패스 보유 / 자동 M패스 설정 시 PyNest 승인 학생)
create or replace function public.mh_has_pass()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mh_is_admin()
    or exists (
      select 1 from public.mh_pass m
      where m.user_id = auth.uid()
        and m.active
        and (m.expires is null or m.expires >= (now() at time zone 'Asia/Seoul')::date)
    )
    or (
      coalesce((select value ->> 'autoPass' from public.mh_meta where key = 'site'), 'false') = 'true'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
    );
$$;

-- 다운로드 수 +1 (공개된 자료만)
create or replace function public.mh_count_download(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.mh_files set downloads = downloads + 1 where id = p_id and visible;
$$;

-- 관리자가 PyNest ID(username)로 M패스 부여·변경. 결과: 'ok' / 'not_found'
create or replace function public.mh_grant_pass(p_username text, p_expires date, p_memo text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.mh_is_admin() then
    raise exception 'admin only';
  end if;
  select p.id, p.username into v_id, v_name
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
  if v_id is null then
    return 'not_found';
  end if;
  insert into public.mh_pass (user_id, username, active, expires, memo)
  values (v_id, v_name, true, p_expires, coalesce(p_memo, ''))
  on conflict (user_id) do update
    set username = excluded.username, active = true, expires = excluded.expires,
        memo = excluded.memo, updated_at = now();
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------
-- 보안 규칙 (RLS)
-- ---------------------------------------------------------------------
alter table public.mh_meta enable row level security;
alter table public.mh_files enable row level security;
alter table public.mh_premium enable row level security;
alter table public.mh_pass enable row level security;

-- 설정·과목: 누구나 읽기 / 관리자만 쓰기
drop policy if exists mh_meta_read on public.mh_meta;
create policy mh_meta_read on public.mh_meta for select using (true);
drop policy if exists mh_meta_admin on public.mh_meta;
create policy mh_meta_admin on public.mh_meta for all
  using (public.mh_is_admin()) with check (public.mh_is_admin());

-- 자료: 공개(visible)만 누구나 읽기, 숨김은 관리자만
drop policy if exists mh_files_read on public.mh_files;
create policy mh_files_read on public.mh_files for select
  using (visible or public.mh_is_admin());
drop policy if exists mh_files_admin on public.mh_files;
create policy mh_files_admin on public.mh_files for all
  using (public.mh_is_admin()) with check (public.mh_is_admin());

-- 프리미엄 링크: M패스 보유자(공개 자료만) + 관리자
drop policy if exists mh_premium_read on public.mh_premium;
create policy mh_premium_read on public.mh_premium for select
  using (
    public.mh_is_admin()
    or (public.mh_has_pass()
        and exists (select 1 from public.mh_files f where f.id = file_id and f.visible))
  );
drop policy if exists mh_premium_admin on public.mh_premium;
create policy mh_premium_admin on public.mh_premium for all
  using (public.mh_is_admin()) with check (public.mh_is_admin());

-- M패스 명단: 본인 것만 / 관리자는 전부
drop policy if exists mh_pass_read on public.mh_pass;
create policy mh_pass_read on public.mh_pass for select
  using (user_id = auth.uid() or public.mh_is_admin());
drop policy if exists mh_pass_admin on public.mh_pass;
create policy mh_pass_admin on public.mh_pass for all
  using (public.mh_is_admin()) with check (public.mh_is_admin());

-- ---------------------------------------------------------------------
-- 권한 (새 Supabase 프로젝트는 자동 공개가 꺼져 있을 수 있어서 직접 부여)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.mh_meta, public.mh_files to anon, authenticated;
grant insert, update, delete on public.mh_meta, public.mh_files to authenticated;
grant select, insert, update, delete on public.mh_premium, public.mh_pass to authenticated;

revoke all on function public.mh_grant_pass(text, date, text) from public, anon;
grant execute on function public.mh_is_admin() to anon, authenticated;
grant execute on function public.mh_has_pass() to anon, authenticated;
grant execute on function public.mh_count_download(uuid) to anon, authenticated;

-- =====================================================================
--  v4 : M포인트 (충전 · 구매 · 내역)
-- =====================================================================
-- 자료별 M포인트 가격 (0 = 포인트로 판매 안 함)
alter table public.mh_files add column if not exists price int not null default 0 check (price >= 0);

-- 회원별 M포인트 잔액
create table if not exists public.mh_points (
  user_id uuid primary key,
  username text not null default '',
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- 포인트 내역 (지급 · 차감 · 충전 · 구매)
create table if not exists public.mh_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  username text not null default '',
  delta int not null,
  balance_after int not null,
  kind text not null check (kind in ('grant', 'deduct', 'charge', 'purchase')),
  file_id uuid references public.mh_files(id) on delete set null,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mh_ledger_user_idx on public.mh_ledger (user_id, created_at desc);

-- 구매한 자료 (한 번 사면 계속 받을 수 있어요)
create table if not exists public.mh_purchases (
  user_id uuid not null,
  file_id uuid not null references public.mh_files(id) on delete cascade,
  price int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

-- 충전 신청 (입금 후 관리자가 승인하면 포인트가 들어가요)
create table if not exists public.mh_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  username text not null default '',
  amount int not null check (amount > 0),
  depositor text not null default '',
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 내가 산 자료인가?
create or replace function public.mh_owns(p_file uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.mh_purchases p where p.user_id = auth.uid() and p.file_id = p_file);
$$;

-- 자료 구매. 결과: ok / already / insufficient / not_for_sale / not_found / login / blocked
create or replace function public.mh_buy_file(p_file uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_title text;
  v_visible boolean;
  v_name text;
  v_status text;
  v_bal int;
begin
  if v_uid is null then return 'login'; end if;
  select p.username, p.status into v_name, v_status from public.profiles p where p.id = v_uid;
  if v_status = 'rejected' then return 'blocked'; end if;
  select f.price, f.title, f.visible into v_price, v_title, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return 'not_found'; end if;
  if public.mh_has_pass() or public.mh_owns(p_file) then return 'already'; end if;
  if v_price <= 0 then return 'not_for_sale'; end if;

  insert into public.mh_points (user_id, username, balance) values (v_uid, coalesce(v_name, ''), 0)
    on conflict (user_id) do nothing;
  select balance into v_bal from public.mh_points where user_id = v_uid for update;
  if v_bal < v_price then return 'insufficient'; end if;

  update public.mh_points set balance = balance - v_price, updated_at = now() where user_id = v_uid;
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, v_price);
  insert into public.mh_ledger (user_id, username, delta, balance_after, kind, file_id, memo)
    values (v_uid, coalesce(v_name, ''), -v_price, v_bal - v_price, 'purchase', p_file, left(v_title, 120));
  return 'ok';
end;
$$;

-- 관리자: 포인트 지급(+) / 차감(-). 결과: ok / not_found / insufficient / invalid
create or replace function public.mh_adjust_points(p_username text, p_delta int, p_memo text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_bal int;
begin
  if not public.mh_is_admin() then raise exception 'admin only'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000000 then return 'invalid'; end if;
  select p.id, p.username into v_id, v_name from public.profiles p
    where lower(p.username) = lower(trim(p_username)) limit 1;
  if v_id is null then return 'not_found'; end if;

  insert into public.mh_points (user_id, username, balance) values (v_id, v_name, 0)
    on conflict (user_id) do nothing;
  select balance into v_bal from public.mh_points where user_id = v_id for update;
  if v_bal + p_delta < 0 then return 'insufficient'; end if;

  update public.mh_points set balance = v_bal + p_delta, username = v_name, updated_at = now() where user_id = v_id;
  insert into public.mh_ledger (user_id, username, delta, balance_after, kind, memo)
    values (v_id, v_name, p_delta, v_bal + p_delta, case when p_delta > 0 then 'grant' else 'deduct' end, left(coalesce(p_memo, ''), 120));
  return 'ok';
end;
$$;

-- 회원: 충전 신청. 결과: ok / invalid / too_many / login / blocked
create or replace function public.mh_request_charge(p_amount int, p_depositor text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_status text;
begin
  if v_uid is null then return 'login'; end if;
  select p.username, p.status into v_name, v_status from public.profiles p where p.id = v_uid;
  if v_status = 'rejected' then return 'blocked'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then return 'invalid'; end if;
  if (select count(*) from public.mh_charges c where c.user_id = v_uid and c.status = 'pending') >= 5 then
    return 'too_many';
  end if;
  insert into public.mh_charges (user_id, username, amount, depositor)
    values (v_uid, coalesce(v_name, ''), p_amount, left(coalesce(trim(p_depositor), ''), 40));
  return 'ok';
end;
$$;

-- 관리자: 충전 신청 승인/거절. 결과: ok / not_found / already_done
create or replace function public.mh_resolve_charge(p_id uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  c public.mh_charges%rowtype;
  v_bal int;
begin
  if not public.mh_is_admin() then raise exception 'admin only'; end if;
  select * into c from public.mh_charges where id = p_id for update;
  if not found then return 'not_found'; end if;
  if c.status <> 'pending' then return 'already_done'; end if;
  if p_approve then
    insert into public.mh_points (user_id, username, balance) values (c.user_id, c.username, 0)
      on conflict (user_id) do nothing;
    select balance into v_bal from public.mh_points where user_id = c.user_id for update;
    update public.mh_points set balance = v_bal + c.amount, updated_at = now() where user_id = c.user_id;
    insert into public.mh_ledger (user_id, username, delta, balance_after, kind, memo)
      values (c.user_id, c.username, c.amount, v_bal + c.amount, 'charge', left('충전 승인 ' || c.depositor, 120));
    update public.mh_charges set status = 'done', resolved_at = now() where id = p_id;
  else
    update public.mh_charges set status = 'rejected', resolved_at = now() where id = p_id;
  end if;
  return 'ok';
end;
$$;

-- 프리미엄 링크: 관리자 / M패스 / 구매한 사람 (공개 자료만)
drop policy if exists mh_premium_read on public.mh_premium;
create policy mh_premium_read on public.mh_premium for select
  using (
    public.mh_is_admin()
    or ((public.mh_has_pass() or public.mh_owns(file_id))
        and exists (select 1 from public.mh_files f where f.id = file_id and f.visible))
  );

-- 포인트 관련 표: 읽기만 열고(본인 것 / 관리자는 전부), 쓰기는 위 함수로만
alter table public.mh_points enable row level security;
alter table public.mh_ledger enable row level security;
alter table public.mh_purchases enable row level security;
alter table public.mh_charges enable row level security;

drop policy if exists mh_points_read on public.mh_points;
create policy mh_points_read on public.mh_points for select using (user_id = auth.uid() or public.mh_is_admin());
drop policy if exists mh_ledger_read on public.mh_ledger;
create policy mh_ledger_read on public.mh_ledger for select using (user_id = auth.uid() or public.mh_is_admin());
drop policy if exists mh_purchases_read on public.mh_purchases;
create policy mh_purchases_read on public.mh_purchases for select using (user_id = auth.uid() or public.mh_is_admin());
drop policy if exists mh_charges_read on public.mh_charges;
create policy mh_charges_read on public.mh_charges for select using (user_id = auth.uid() or public.mh_is_admin());

grant select on public.mh_points, public.mh_ledger, public.mh_purchases, public.mh_charges to authenticated;

revoke all on function public.mh_buy_file(uuid) from public, anon;
revoke all on function public.mh_adjust_points(text, int, text) from public, anon;
revoke all on function public.mh_request_charge(int, text) from public, anon;
revoke all on function public.mh_resolve_charge(uuid, boolean) from public, anon;
grant execute on function public.mh_owns(uuid) to anon, authenticated;
grant execute on function public.mh_buy_file(uuid) to authenticated;
grant execute on function public.mh_adjust_points(text, int, text) to authenticated;
grant execute on function public.mh_request_charge(int, text) to authenticated;
grant execute on function public.mh_resolve_charge(uuid, boolean) to authenticated;

-- =====================================================================
--  v4.1 : 민혁닷컴에서 가입하면 PyNest 도 바로 사용 (자동 승인)
--  관리자 패널 > 사이트 설정에서 켜고 끌 수 있어요. (설정이 없으면 켜진 것으로 봐요)
--  민혁닷컴 가입 화면이 보내는 표시(src = mcom)가 있는 새 계정만 승인되고, 권한(role)은 건드리지 않아요.
-- =====================================================================
create or replace function public.mh_auto_approve()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'pending'
     and coalesce((select value ->> 'autoApprove' from public.mh_meta where key = 'site'), 'true') = 'true'
     and exists (select 1 from auth.users u where u.id = new.id and u.raw_user_meta_data ->> 'src' = 'mcom') then
    new.status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists mh_auto_approve on public.profiles;
create trigger mh_auto_approve before insert on public.profiles
  for each row execute function public.mh_auto_approve();

-- =====================================================================
--  v5 : PDF 직접 업로드(Supabase Storage) + 공지사항
-- =====================================================================
-- 문제/해설/미리보기를 "드라이브 링크"로 둘지 "직접 업로드"로 둘지 (자료마다 따로)
alter table public.mh_files add column if not exists main_src text not null default 'drive' check (main_src in ('drive', 'upload'));
alter table public.mh_files add column if not exists solution_src text not null default 'drive' check (solution_src in ('drive', 'upload'));
alter table public.mh_files add column if not exists preview_src text not null default 'drive' check (preview_src in ('drive', 'upload'));

-- 업로드 파일 보관함 (비공개). 파일은 "<자료id>/main.pdf" · "<자료id>/solution.pdf" · "<자료id>/preview.pdf" 로 저장돼요.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mh-files', 'mh-files', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 이 업로드 파일을 읽을 수 있는 사람은? (관리자 / 미리보기는 누구나 / 무료 자료의 문제 PDF는 누구나 / 그 외는 M패스 또는 구매자)
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
  if public.mh_is_admin() then return true; end if;
  begin
    v_id := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  v_kind := split_part(split_part(p_name, '/', 2), '.', 1);
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = v_id;
  if not found or not v_visible then return false; end if;
  if v_kind = 'preview' then return true; end if;
  if v_kind = 'main' and v_tier = 'free' then return true; end if;
  return public.mh_has_pass() or public.mh_owns(v_id);
end;
$$;
grant execute on function public.mh_can_read_object(text) to anon, authenticated;

drop policy if exists mh_files_obj_read on storage.objects;
create policy mh_files_obj_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'mh-files' and public.mh_can_read_object(name));
drop policy if exists mh_files_obj_ins on storage.objects;
create policy mh_files_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'mh-files' and public.mh_is_admin());
drop policy if exists mh_files_obj_upd on storage.objects;
create policy mh_files_obj_upd on storage.objects for update to authenticated
  using (bucket_id = 'mh-files' and public.mh_is_admin()) with check (bucket_id = 'mh-files' and public.mh_is_admin());
drop policy if exists mh_files_obj_del on storage.objects;
create policy mh_files_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'mh-files' and public.mh_is_admin());

-- 공지사항 (PyNest 처럼 선생님만 쓰고 모두가 읽어요)
create table if not exists public.mh_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  visible boolean not null default true,
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.mh_notices enable row level security;
drop policy if exists mh_notices_read on public.mh_notices;
create policy mh_notices_read on public.mh_notices for select using (visible or public.mh_is_admin());
drop policy if exists mh_notices_admin on public.mh_notices;
create policy mh_notices_admin on public.mh_notices for all
  using (public.mh_is_admin()) with check (public.mh_is_admin());
grant select on public.mh_notices to anon, authenticated;
grant insert, update, delete on public.mh_notices to authenticated;

-- =====================================================================
-- v6: M패스 = 기간권 + 받을 수 있는 건수 / 등급은 가격으로 자동 결정
--   - 가격 0 → 무료 / 1 이상 → 프리미엄
--   - M패스는 기간 안에서 정해진 건수만큼 자료를 "받기"(1건 = 자료 1개, 문제+해설 함께)
--   - 받은 자료는 구매한 자료처럼 계속 다시 받을 수 있어요
-- =====================================================================
alter table public.mh_pass add column if not exists plan text not null default '';
alter table public.mh_pass add column if not exists quota int not null default 0;
alter table public.mh_pass add column if not exists used int not null default 0;

-- 기존 자료 정리: 가격에 맞춰 등급과 드라이브 ID 위치(무료=공개 칸, 프리미엄=비공개 칸)를 맞춰요
update public.mh_files f
   set tier = 'free',
       drive_id = coalesce(f.drive_id, (select p.drive_id from public.mh_premium p where p.file_id = f.id))
 where f.price <= 0 and f.tier = 'premium';
insert into public.mh_premium (file_id, drive_id)
  select f.id, f.drive_id from public.mh_files f where f.price > 0 and f.tier = 'free'
  on conflict (file_id) do update set drive_id = coalesce(public.mh_premium.drive_id, excluded.drive_id);
update public.mh_files set tier = 'premium', drive_id = null where price > 0 and tier = 'free';

-- 기본 M패스 플랜 (문제 1세트 300P 기준). 이미 설정돼 있으면 건드리지 않아요. 관리자 > 사이트 설정에서 바꿀 수 있어요.
insert into public.mh_meta (key, value)
values ('site', jsonb_build_object('passPlans', '[
  {"id":"p45","name":"45일","days":45,"quota":15,"price":3900},
  {"id":"p90","name":"90일","days":90,"quota":35,"price":8400},
  {"id":"p180","name":"6개월","days":180,"quota":80,"price":17600},
  {"id":"p365","name":"12개월","days":365,"quota":180,"price":36000}
]'::jsonb))
on conflict (key) do update
  set value = public.mh_meta.value || jsonb_build_object('passPlans', excluded.value -> 'passPlans'), updated_at = now()
  where not (public.mh_meta.value ? 'passPlans');

-- 지금 M패스(기간 안)를 가지고 있나? (관리자는 항상)
create or replace function public.mh_has_pass()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mh_is_admin()
    or exists (
      select 1 from public.mh_pass m
      where m.user_id = auth.uid() and m.active
        and (m.expires is null or m.expires >= (now() at time zone 'Asia/Seoul')::date)
    );
$$;

-- M패스로 더 받을 수 있는 건수
create or replace function public.mh_pass_left()
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select greatest(m.quota - m.used, 0) from public.mh_pass m
    where m.user_id = auth.uid() and m.active
      and (m.expires is null or m.expires >= (now() at time zone 'Asia/Seoul')::date)
  ), 0);
$$;

-- 관리자가 M패스 부여·변경 (건수는 새로 정해져요). 결과: ok / not_found
drop function if exists public.mh_grant_pass(text, date, text);
create or replace function public.mh_grant_pass(p_username text, p_expires date, p_memo text, p_quota int default 0, p_plan text default '')
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.mh_is_admin() then raise exception 'admin only'; end if;
  select p.id, p.username into v_id, v_name
  from public.profiles p where lower(p.username) = lower(trim(p_username)) limit 1;
  if v_id is null then return 'not_found'; end if;
  insert into public.mh_pass (user_id, username, active, expires, memo, quota, used, plan)
  values (v_id, v_name, true, p_expires, coalesce(p_memo, ''), greatest(coalesce(p_quota, 0), 0), 0, coalesce(p_plan, ''))
  on conflict (user_id) do update
    set username = excluded.username, active = true, expires = excluded.expires, memo = excluded.memo,
        quota = excluded.quota, used = 0, plan = excluded.plan, updated_at = now();
  return 'ok';
end;
$$;
grant execute on function public.mh_grant_pass(text, date, text, int, text) to authenticated;

-- M패스로 자료 받기 (건수 1 차감). 결과: ok / already / free / no_pass / no_quota / not_found / login
create or replace function public.mh_claim_file(p_file uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_visible boolean;
  v_row public.mh_pass%rowtype;
begin
  if v_uid is null then return 'login'; end if;
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return 'not_found'; end if;
  if v_tier = 'free' then return 'free'; end if;
  if public.mh_is_admin() or public.mh_owns(p_file) then return 'already'; end if;
  select * into v_row from public.mh_pass m where m.user_id = v_uid for update;
  if not found or not v_row.active
     or (v_row.expires is not null and v_row.expires < (now() at time zone 'Asia/Seoul')::date) then
    return 'no_pass';
  end if;
  if v_row.used >= v_row.quota then return 'no_quota'; end if;
  update public.mh_pass set used = used + 1, updated_at = now() where user_id = v_uid;
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, 0);
  return 'ok';
end;
$$;
grant execute on function public.mh_claim_file(uuid) to authenticated;

-- M포인트로 M패스 구매. 플랜(기간·건수·가격)은 사이트 설정(passPlans)에서 읽어요.
-- 결과: ok / insufficient / not_found / login / blocked. 이미 패스가 있으면 기간·건수가 이어져요.
create or replace function public.mh_buy_pass(p_plan text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_status text;
  v_plan jsonb;
  v_price int;
  v_days int;
  v_quota int;
  v_bal int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_row public.mh_pass%rowtype;
begin
  if v_uid is null then return 'login'; end if;
  select p.username, p.status into v_name, v_status from public.profiles p where p.id = v_uid;
  if v_status = 'rejected' then return 'blocked'; end if;
  select e into v_plan
    from jsonb_array_elements(coalesce((select value -> 'passPlans' from public.mh_meta where key = 'site'), '[]'::jsonb)) e
   where e ->> 'id' = p_plan limit 1;
  if v_plan is null then return 'not_found'; end if;
  v_price := coalesce((v_plan ->> 'price')::int, 0);
  v_days := coalesce((v_plan ->> 'days')::int, 0);
  v_quota := coalesce((v_plan ->> 'quota')::int, 0);
  if v_price <= 0 or v_days <= 0 or v_quota <= 0 then return 'not_found'; end if;

  insert into public.mh_points (user_id, username, balance) values (v_uid, coalesce(v_name, ''), 0)
    on conflict (user_id) do nothing;
  select balance into v_bal from public.mh_points where user_id = v_uid for update;
  if v_bal < v_price then return 'insufficient'; end if;
  update public.mh_points set balance = balance - v_price, updated_at = now() where user_id = v_uid;
  insert into public.mh_ledger (user_id, username, delta, balance_after, kind, memo)
    values (v_uid, coalesce(v_name, ''), -v_price, v_bal - v_price, 'purchase', left('M패스 ' || coalesce(v_plan ->> 'name', p_plan), 120));

  select * into v_row from public.mh_pass m where m.user_id = v_uid for update;
  if found and v_row.active and (v_row.expires is null or v_row.expires >= v_today) then
    update public.mh_pass
       set expires = coalesce(v_row.expires, v_today) + v_days,
           quota = greatest(v_row.quota - v_row.used, 0) + v_quota, used = 0,
           plan = coalesce(v_plan ->> 'name', p_plan), updated_at = now()
     where user_id = v_uid;
  else
    insert into public.mh_pass (user_id, username, active, expires, memo, quota, used, plan)
      values (v_uid, coalesce(v_name, ''), true, v_today + v_days, 'M포인트 구매', v_quota, 0, coalesce(v_plan ->> 'name', p_plan))
      on conflict (user_id) do update
        set active = true, expires = excluded.expires, quota = excluded.quota, used = 0,
            plan = excluded.plan, memo = excluded.memo, updated_at = now();
  end if;
  return 'ok';
end;
$$;
grant execute on function public.mh_buy_pass(text) to authenticated;

-- 자료 구매 (M패스 무관 — 패스는 mh_claim_file 로 받아요)
create or replace function public.mh_buy_file(p_file uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_title text;
  v_visible boolean;
  v_name text;
  v_status text;
  v_bal int;
begin
  if v_uid is null then return 'login'; end if;
  select p.username, p.status into v_name, v_status from public.profiles p where p.id = v_uid;
  if v_status = 'rejected' then return 'blocked'; end if;
  select f.price, f.title, f.visible into v_price, v_title, v_visible from public.mh_files f where f.id = p_file;
  if not found or not v_visible then return 'not_found'; end if;
  if public.mh_is_admin() or public.mh_owns(p_file) then return 'already'; end if;
  if v_price <= 0 then return 'not_for_sale'; end if;

  insert into public.mh_points (user_id, username, balance) values (v_uid, coalesce(v_name, ''), 0)
    on conflict (user_id) do nothing;
  select balance into v_bal from public.mh_points where user_id = v_uid for update;
  if v_bal < v_price then return 'insufficient'; end if;

  update public.mh_points set balance = balance - v_price, updated_at = now() where user_id = v_uid;
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, v_price);
  insert into public.mh_ledger (user_id, username, delta, balance_after, kind, file_id, memo)
    values (v_uid, coalesce(v_name, ''), -v_price, v_bal - v_price, 'purchase', p_file, left(v_title, 120));
  return 'ok';
end;
$$;

-- 드라이브 링크: 관리자 / 구매·받은 사람 / 무료 자료(공개된 것)
drop policy if exists mh_premium_read on public.mh_premium;
create policy mh_premium_read on public.mh_premium for select
  using (
    public.mh_is_admin()
    or (exists (select 1 from public.mh_files f where f.id = file_id and f.visible)
        and (public.mh_owns(file_id)
             or exists (select 1 from public.mh_files f where f.id = file_id and f.tier = 'free')))
  );

-- 업로드 파일 읽기: 관리자 / 미리보기는 누구나 / 무료 자료는 문제·해설 누구나 / 그 외는 구매·받은 사람
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
  if public.mh_is_admin() then return true; end if;
  begin
    v_id := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  v_kind := split_part(split_part(p_name, '/', 2), '.', 1);
  select f.tier, f.visible into v_tier, v_visible from public.mh_files f where f.id = v_id;
  if not found or not v_visible then return false; end if;
  if v_kind = 'preview' then return true; end if;
  if v_tier = 'free' then return true; end if;
  return public.mh_owns(v_id);
end;
$$;
grant execute on function public.mh_can_read_object(text) to anon, authenticated;
grant execute on function public.mh_pass_left() to authenticated;
