-- ============================================================
--  v11: 구매/이용권으로 받은 파일은 30일 뒤 만료 + 다운로드 기록(회색 버튼)
--  Supabase SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- ============================================================

-- 1) 만료일 (기존 구매는 지금부터 30일)
alter table public.mh_purchases
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');

-- 2) 소유 판정: 만료 안 된 것만
create or replace function public.mh_owns(p_file uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mh_purchases p
                 where p.user_id = auth.uid() and p.file_id = p_file and p.expires_at > now());
$$;

-- 3) 다운로드 기록 (회색 버튼용)
create table if not exists public.mh_dl (
  user_id uuid not null,
  file_id uuid not null references public.mh_files(id) on delete cascade,
  kind text not null check (kind in ('main','solution')),
  at timestamptz not null default now(),
  primary key (user_id, file_id, kind)
);
alter table public.mh_dl enable row level security;
drop policy if exists mh_dl_read on public.mh_dl;
create policy mh_dl_read on public.mh_dl for select using (user_id = auth.uid());

create or replace function public.mh_mark_dl(p_file uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('main','solution') then return; end if;
  insert into public.mh_dl (user_id, file_id, kind) values (auth.uid(), p_file, p_kind)
    on conflict (user_id, file_id, kind) do update set at = now();
end $$;
grant execute on function public.mh_mark_dl(uuid, text) to authenticated;

-- 4) 구매: 만료된 건 다시 구매하면 30일 갱신 + 다운로드 기록 초기화
create or replace function public.mh_buy_file(p_file uuid) returns text
language plpgsql security definer set search_path = public as $$
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

-- 5) 이용권 차감: 동일
create or replace function public.mh_claim_file(p_file uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_tier text; v_visible boolean; v_row public.mh_pass%rowtype;
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
  insert into public.mh_purchases (user_id, file_id, price) values (v_uid, p_file, 0)
    on conflict (user_id, file_id) do update
      set price = 0, created_at = now(), expires_at = now() + interval '30 days';
  delete from public.mh_dl where user_id = v_uid and file_id = p_file;
  return 'ok';
end $$;
