-- Wholesale Hub: homes / land split (2026-10-28). Run AFTER 20261028170000_wholesale_stats_state.sql.
-- wholesale_stats gets type ('homes' | 'land', default homes) and its primary key becomes (state, type, key). Existing rows become homes.
-- wholesale_set / wholesale_get take an optional type that defaults to homes, so current calls (token + values [+ state]) keep working.
--   The previous 3-/2-argument functions are replaced (an overload would be ambiguous).
-- wholesale_deals gets type ('homes' | 'land', default homes); deals_upsert accepts and validates it (deals_list returns it automatically).
-- RLS and grants are unchanged. Numbers/deal facts only, never owner names or mailing addresses.

alter table public.wholesale_stats add column if not exists type text not null default 'homes';
alter table public.wholesale_stats drop constraint if exists wholesale_stats_type_check;
alter table public.wholesale_stats add constraint wholesale_stats_type_check check (type in ('homes', 'land'));
alter table public.wholesale_stats drop constraint if exists wholesale_stats_pkey;
alter table public.wholesale_stats add constraint wholesale_stats_pkey primary key (state, type, key);

alter table public.wholesale_deals add column if not exists type text not null default 'homes';
alter table public.wholesale_deals drop constraint if exists wholesale_deals_type_check;
alter table public.wholesale_deals add constraint wholesale_deals_type_check check (type in ('homes', 'land'));

drop function if exists public.wholesale_set(text, jsonb, text);
drop function if exists public.wholesale_get(text, text);

create or replace function public.wholesale_set(p_token text, p_values jsonb, p_state text default 'NM', p_type text default 'homes') returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; k text; v jsonb; n bigint; st text := coalesce(p_state, 'NM'); ty text := coalesce(p_type, 'homes');
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'state must be 2 uppercase letters'; end if;
  if ty not in ('homes', 'land') then raise exception 'type must be homes or land'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then raise exception 'no values'; end if;
  for k, v in select * from jsonb_each(p_values) loop
    if k not in ('listings', 'call_today', 'week', 'worth_a_look') then raise exception 'unknown key %', k; end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,9}$' then raise exception 'value for % must be a whole number', k; end if;
  end loop;
  for k, v in select * from jsonb_each(p_values) loop
    n := (v #>> '{}')::bigint;
    insert into public.wholesale_stats(state, type, key, value, updated_at) values (st, ty, k, n, now())
      on conflict (state, type, key) do update set value = excluded.value, updated_at = now();
  end loop;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats where state = st and type = ty);
end $$;
create or replace function public.wholesale_get(p_token text, p_state text default 'NM', p_type text default 'homes') returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; st text := coalesce(p_state, 'NM'); ty text := coalesce(p_type, 'homes');
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'state must be 2 uppercase letters'; end if;
  if ty not in ('homes', 'land') then raise exception 'type must be homes or land'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.wholesale_stats where state = st and type = ty);
end $$;
revoke all on function public.wholesale_set(text, jsonb, text, text) from public;
revoke all on function public.wholesale_get(text, text, text) from public;
grant execute on function public.wholesale_set(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.wholesale_get(text, text, text) to anon, authenticated;

-- deals_upsert: same as before plus the optional "type" key (homes | land; new deals default to homes; omitted on update = untouched).
create or replace function public.deals_upsert(p_token text, p_deals jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; nk constant text[] := array['list_price','arv','rehab','max_offer'];
  tk constant text[] := array['address','creative_structure','notes','call_script'];
  ak constant text[] := array['ext_id','type','address','list_price','arv','rehab','max_offer','creative_structure','status','notes','call_script'];
  i int := 0; ins int := 0; upd int := 0; n numeric; xid text; r record;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_deals is null or jsonb_typeof(p_deals) <> 'array' or jsonb_array_length(p_deals) = 0 then raise exception 'p_deals must be a non-empty array'; end if;
  if jsonb_array_length(p_deals) > 200 then raise exception 'at most 200 deals per call'; end if;
  -- pass 1: validate everything, write nothing
  for d in select * from jsonb_array_elements(p_deals) loop
    i := i + 1;
    if jsonb_typeof(d) <> 'object' then raise exception 'deal %: must be an object', i; end if;
    for k, v in select * from jsonb_each(d) loop
      if not (k = any(ak)) then raise exception 'deal %: unknown key "%" (allowed: %)', i, k, array_to_string(ak, ', '); end if;
      if k = any(nk) then
        if jsonb_typeof(v) <> 'number' then raise exception 'deal %: % must be a number', i, k; end if;
        n := (v #>> '{}')::numeric;
        if abs(n) >= 1e10 or (k <> 'max_offer' and n < 0) then raise exception 'deal %: % out of range', i, k; end if;
      elsif k = 'type' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('homes','land') then raise exception 'deal %: type must be homes or land', i; end if;
      elsif k = 'status' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('Considering','Offered','Under contract','Assigned','Dead') then raise exception 'deal %: status must be one of Considering, Offered, Under contract, Assigned, Dead', i; end if;
      elsif jsonb_typeof(v) <> 'string' then raise exception 'deal %: % must be text', i, k;
      end if;
    end loop;
    xid := d ->> 'ext_id';
    if xid is null or length(btrim(xid)) = 0 or length(xid) > 80 then raise exception 'deal %: ext_id required (1-80 chars)', i; end if;
    if (d ->> 'address') is not null and length(d ->> 'address') > 200 then raise exception 'deal %: address too long (200)', i; end if;
    if (d ->> 'creative_structure') is not null and length(d ->> 'creative_structure') > 2000 then raise exception 'deal %: creative_structure too long (2000)', i; end if;
    if (d ->> 'notes') is not null and length(d ->> 'notes') > 4000 then raise exception 'deal %: notes too long (4000)', i; end if;
    if (d ->> 'call_script') is not null and length(d ->> 'call_script') > 8000 then raise exception 'deal %: call_script too long (8000)', i; end if;
  end loop;
  -- pass 2: write (one transaction: any error rolls back the whole call)
  for d in select * from jsonb_array_elements(p_deals) loop
    xid := d ->> 'ext_id';
    if exists (select 1 from public.wholesale_deals where ext_id = xid) then
      update public.wholesale_deals w set
        address = case when d ? 'address' then d ->> 'address' else w.address end,
        list_price = case when d ? 'list_price' then (d ->> 'list_price')::numeric else w.list_price end,
        arv = case when d ? 'arv' then (d ->> 'arv')::numeric else w.arv end,
        rehab = case when d ? 'rehab' then (d ->> 'rehab')::numeric else w.rehab end,
        max_offer = case when d ? 'max_offer' then (d ->> 'max_offer')::numeric else w.max_offer end,
        creative_structure = case when d ? 'creative_structure' then d ->> 'creative_structure' else w.creative_structure end,
        type = case when d ? 'type' then d ->> 'type' else w.type end,
        status = case when d ? 'status' then d ->> 'status' else w.status end,
        notes = case when d ? 'notes' then d ->> 'notes' else w.notes end,
        call_script = case when d ? 'call_script' then d ->> 'call_script' else w.call_script end
      where w.ext_id = xid;
      upd := upd + 1;
    else
      insert into public.wholesale_deals(ext_id, type, address, list_price, arv, rehab, max_offer, creative_structure, status, notes, call_script)
      values (xid, coalesce(d ->> 'type', 'homes'), d ->> 'address', (d ->> 'list_price')::numeric, (d ->> 'arv')::numeric, (d ->> 'rehab')::numeric, (d ->> 'max_offer')::numeric,
        d ->> 'creative_structure', coalesce(d ->> 'status', 'Considering'), d ->> 'notes', d ->> 'call_script');
      ins := ins + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_deals));
end $$;

revoke all on function public.deals_upsert(text, jsonb) from public;
grant execute on function public.deals_upsert(text, jsonb) to anon, authenticated;
