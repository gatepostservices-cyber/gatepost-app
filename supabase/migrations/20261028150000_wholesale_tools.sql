-- Wholesale Hub tools (2026-10-28). ADDITIVE ONLY: new tables/functions/policies, nothing existing is altered or dropped.
-- Everything is Christian-only: has_hub('wholesale') = is_owner AND a hub_access row. Nate (owner, no row) reads/writes nothing.
-- NO owner-name or mailing-address columns exist anywhere here (address = the property address only).

-- 1) Deal tracker
create table if not exists public.wholesale_deals (
  id uuid primary key default gen_random_uuid(),
  ext_id text not null unique check (length(ext_id) between 1 and 80),
  address text check (length(address) <= 200),
  list_price numeric(14,2) check (list_price >= 0 and list_price < 1e10),
  arv numeric(14,2) check (arv >= 0 and arv < 1e10),
  rehab numeric(14,2) check (rehab >= 0 and rehab < 1e10),
  max_offer numeric(14,2) check (max_offer > -1e10 and max_offer < 1e10),
  creative_structure text check (length(creative_structure) <= 2000),
  status text not null default 'Considering' check (status in ('Considering', 'Offered', 'Under contract', 'Assigned', 'Dead')),
  notes text check (length(notes) <= 4000),
  call_script text check (length(call_script) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.wholesale_deals enable row level security;
drop policy if exists "wholesale_deals owner read" on public.wholesale_deals;
create policy "wholesale_deals owner read" on public.wholesale_deals for select to authenticated using ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_deals owner update" on public.wholesale_deals;
create policy "wholesale_deals owner update" on public.wholesale_deals for update to authenticated
  using ((select public.has_hub('wholesale'))) with check ((select public.has_hub('wholesale')));
revoke all on public.wholesale_deals from anon, authenticated;
grant select on public.wholesale_deals to authenticated;
grant update (status, notes) on public.wholesale_deals to authenticated;   -- the app can change ONLY status + notes; rows are created/edited by deals_upsert (token)
drop trigger if exists wholesale_deals_touch on public.wholesale_deals;
create trigger wholesale_deals_touch before update on public.wholesale_deals for each row execute function public.touch_updated_at();

-- 2) Buyers list + buy-box
create table if not exists public.wholesale_buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  company text check (length(company) <= 120),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 160),
  areas text check (length(areas) <= 500),
  property_types text check (length(property_types) <= 300),
  price_min numeric(14,2) check (price_min >= 0 and price_min < 1e10),
  price_max numeric(14,2) check (price_max >= 0 and price_max < 1e10),
  rehab_tolerance text check (length(rehab_tolerance) <= 200),
  financing text check (length(financing) <= 200),
  notes text check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_min is null or price_max is null or price_min <= price_max));
alter table public.wholesale_buyers enable row level security;
drop policy if exists "wholesale_buyers owner read" on public.wholesale_buyers;
create policy "wholesale_buyers owner read" on public.wholesale_buyers for select to authenticated using ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_buyers owner insert" on public.wholesale_buyers;
create policy "wholesale_buyers owner insert" on public.wholesale_buyers for insert to authenticated with check ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_buyers owner update" on public.wholesale_buyers;
create policy "wholesale_buyers owner update" on public.wholesale_buyers for update to authenticated
  using ((select public.has_hub('wholesale'))) with check ((select public.has_hub('wholesale')));
revoke all on public.wholesale_buyers from anon, authenticated;
grant select, insert on public.wholesale_buyers to authenticated;
grant update (name, company, phone, email, areas, property_types, price_min, price_max, rehab_tolerance, financing, notes) on public.wholesale_buyers to authenticated;
drop trigger if exists wholesale_buyers_touch on public.wholesale_buyers;
create trigger wholesale_buyers_touch before update on public.wholesale_buyers for each row execute function public.touch_updated_at();

-- 3) Token-checked RPCs for tools/deals.sh (same token/hash as wholesale_set: private.settings 'wholesale_token_sha256').
--    Allowed keys only; owner / mailing / anything else is rejected. Keys present in an object are written; keys left out are untouched
--    (so re-running Dex's file never overwrites a status or note Christian changed, unless the file includes them).
create or replace function public.deals_upsert(p_token text, p_deals jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; nk constant text[] := array['list_price','arv','rehab','max_offer'];
  tk constant text[] := array['address','creative_structure','notes','call_script'];
  ak constant text[] := array['ext_id','address','list_price','arv','rehab','max_offer','creative_structure','status','notes','call_script'];
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
        status = case when d ? 'status' then d ->> 'status' else w.status end,
        notes = case when d ? 'notes' then d ->> 'notes' else w.notes end,
        call_script = case when d ? 'call_script' then d ->> 'call_script' else w.call_script end
      where w.ext_id = xid;
      upd := upd + 1;
    else
      insert into public.wholesale_deals(ext_id, address, list_price, arv, rehab, max_offer, creative_structure, status, notes, call_script)
      values (xid, d ->> 'address', (d ->> 'list_price')::numeric, (d ->> 'arv')::numeric, (d ->> 'rehab')::numeric, (d ->> 'max_offer')::numeric,
        d ->> 'creative_structure', coalesce(d ->> 'status', 'Considering'), d ->> 'notes', d ->> 'call_script');
      ins := ins + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_deals));
end $$;

create or replace function public.deals_list(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w) - 'id' - 'created_at' order by w.updated_at desc), '[]'::jsonb) from public.wholesale_deals w);
end $$;
revoke all on function public.deals_upsert(text, jsonb) from public;
revoke all on function public.deals_list(text) from public;
grant execute on function public.deals_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.deals_list(text) to anon, authenticated;
