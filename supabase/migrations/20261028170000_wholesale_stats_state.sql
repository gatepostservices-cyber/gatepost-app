-- Wholesale Hub: split summary numbers by state (2026-10-28). Run AFTER 20261028150000_wholesale_tools.sql.
-- wholesale_stats gets a state (2 uppercase letters, any state allowed) and its primary key becomes (state, key). Existing rows become NM.
-- wholesale_set / wholesale_get take an optional state that defaults to NM, so old calls (token + values only) keep working.
-- The old 2-argument/1-argument functions are replaced (an overload would be ambiguous and the old one wrote "on conflict (key)").
-- RLS is unchanged (select = has_hub('wholesale')); numbers only, never names or addresses.

alter table public.wholesale_stats add column if not exists state text not null default 'NM';
alter table public.wholesale_stats drop constraint if exists wholesale_stats_state_check;
alter table public.wholesale_stats add constraint wholesale_stats_state_check check (state ~ '^[A-Z]{2}$');
alter table public.wholesale_stats drop constraint if exists wholesale_stats_pkey;
alter table public.wholesale_stats add constraint wholesale_stats_pkey primary key (state, key);

drop function if exists public.wholesale_set(text, jsonb);
drop function if exists public.wholesale_get(text);

create or replace function public.wholesale_set(p_token text, p_values jsonb, p_state text default 'NM') returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; k text; v jsonb; n bigint; st text := coalesce(p_state, 'NM');
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'state must be 2 uppercase letters'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then raise exception 'no values'; end if;
  for k, v in select * from jsonb_each(p_values) loop
    if k not in ('listings', 'call_today', 'week', 'worth_a_look') then raise exception 'unknown key %', k; end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,9}$' then raise exception 'value for % must be a whole number', k; end if;
  end loop;
  for k, v in select * from jsonb_each(p_values) loop
    n := (v #>> '{}')::bigint;
    insert into public.wholesale_stats(state, key, value, updated_at) values (st, k, n, now())
      on conflict (state, key) do update set value = excluded.value, updated_at = now();
  end loop;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats where state = st);
end $$;
create or replace function public.wholesale_get(p_token text, p_state text default 'NM') returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; st text := coalesce(p_state, 'NM');
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'state must be 2 uppercase letters'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats where state = st);
end $$;
revoke all on function public.wholesale_set(text, jsonb, text) from public;
revoke all on function public.wholesale_get(text, text) from public;
grant execute on function public.wholesale_set(text, jsonb, text) to anon, authenticated;
grant execute on function public.wholesale_get(text, text) to anon, authenticated;
