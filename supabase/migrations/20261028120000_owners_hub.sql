-- Owners Hub (2026-10-28). ADDITIVE ONLY: new tables/functions, nothing existing is altered or dropped.
-- Wholesale Hub is Christian-only. Enforced in the database: a row in hub_access (hub='wholesale') AND profiles.is_owner.
-- Nate (also an owner) has no hub_access row, so RLS returns him nothing.

-- 1) per-hub access allowlist (read your own rows only; nobody can write it from the app: no INSERT/UPDATE/DELETE policies or grants)
create table if not exists public.hub_access (
  hub text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hub, user_id));
alter table public.hub_access enable row level security;
drop policy if exists "hub_access read own" on public.hub_access;
create policy "hub_access read own" on public.hub_access for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.hub_access from anon, authenticated;
grant select on public.hub_access to authenticated;

create or replace function public.has_hub(p_hub text) returns boolean language sql stable security definer set search_path = public as
$$ select public.is_owner() and exists (select 1 from public.hub_access where hub = p_hub and user_id = auth.uid()) $$;
revoke all on function public.has_hub(text) from public, anon;
grant execute on function public.has_hub(text) to authenticated;

insert into public.hub_access(hub, user_id)
  select 'wholesale', u.id from auth.users u where lower(u.email) = 'moseley0christian@icloud.com'
  on conflict do nothing;

-- 2) wholesale summary numbers (numbers only: never names or addresses)
create table if not exists public.wholesale_stats (
  key text primary key check (key in ('listings', 'call_today', 'week', 'worth_a_look')),
  value integer not null check (value >= 0),
  updated_at timestamptz not null default now());
alter table public.wholesale_stats enable row level security;
drop policy if exists "wholesale_stats owner read" on public.wholesale_stats;
create policy "wholesale_stats owner read" on public.wholesale_stats for select to authenticated using ((select public.has_hub('wholesale')));
revoke all on public.wholesale_stats from anon, authenticated;
grant select on public.wholesale_stats to authenticated;   -- writes only through wholesale_set (token) below

insert into public.wholesale_stats(key, value) values ('listings', 10), ('call_today', 19), ('week', 142), ('worth_a_look', 299)
  on conflict (key) do nothing;

-- 3) token-checked RPCs for tools/wholesale.sh (Dex on the shared box). Token file lives outside the repo; only its SHA-256 is stored
--    in private.settings (key 'wholesale_token_sha256', set separately, not in this file). Integers only.
create or replace function public.wholesale_set(p_token text, p_values jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; k text; v jsonb; n bigint;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then raise exception 'no values'; end if;
  for k, v in select * from jsonb_each(p_values) loop
    if k not in ('listings', 'call_today', 'week', 'worth_a_look') then raise exception 'unknown key %', k; end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,9}$' then raise exception 'value for % must be a whole number', k; end if;
  end loop;
  for k, v in select * from jsonb_each(p_values) loop
    n := (v #>> '{}')::bigint;
    insert into public.wholesale_stats(key, value, updated_at) values (k, n, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end loop;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats);
end $$;
create or replace function public.wholesale_get(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats);
end $$;
revoke all on function public.wholesale_set(text, jsonb) from public;
revoke all on function public.wholesale_get(text) from public;
grant execute on function public.wholesale_set(text, jsonb) to anon, authenticated;
grant execute on function public.wholesale_get(text) to anon, authenticated;
