-- Wholesale Hub: Builders / Buyers (2026-10-28). ADDITIVE ONLY. Run after 20261028210000_wholesale_title_cos.sql.
-- Separate from the manual wholesale_buyers list. Owner-only (has_hub('wholesale'): is_owner AND a hub_access row).
-- Business contact data only; no property-owner names or mailing addresses.
-- The app can change ONLY status, call_notes and buy_box; rows are created/edited by builders_upsert (token), used by tools/builders.sh.
create table if not exists public.wholesale_builders (
  id uuid primary key default gen_random_uuid(),
  ext_id text not null unique check (length(ext_id) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 200),
  state text not null check (state ~ '^[A-Z]{2}$'),
  type text not null check (type in ('land', 'homes')),
  phone text check (length(phone) <= 40),
  website text check (length(website) <= 300 and website ~* '^https?://'),
  evidence_notes text check (length(evidence_notes) <= 4000),
  buy_box text check (length(buy_box) <= 8000),
  status text not null default 'To call' check (status in ('To call', 'Called', 'Buy box received', 'Not buying')),
  call_notes text check (length(call_notes) <= 4000),
  call_script text check (length(call_script) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.wholesale_builders enable row level security;
drop policy if exists "wholesale_builders owner read" on public.wholesale_builders;
create policy "wholesale_builders owner read" on public.wholesale_builders for select to authenticated using ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_builders owner update" on public.wholesale_builders;
create policy "wholesale_builders owner update" on public.wholesale_builders for update to authenticated
  using ((select public.has_hub('wholesale'))) with check ((select public.has_hub('wholesale')));
revoke all on public.wholesale_builders from anon, authenticated;
grant select on public.wholesale_builders to authenticated;
grant update (status, call_notes, buy_box) on public.wholesale_builders to authenticated;
drop trigger if exists wholesale_builders_touch on public.wholesale_builders;
create trigger wholesale_builders_touch before update on public.wholesale_builders for each row execute function public.touch_updated_at();

-- Token RPCs for tools/builders.sh (same token hash as wholesale_set / title_upsert). Unknown keys rejected. Keys left out of an existing row
-- are untouched. New rows need name, state and type (status defaults to 'To call').
create or replace function public.builders_upsert(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; i int := 0; ins int := 0; upd int := 0; xid text;
  ak constant text[] := array['ext_id','name','state','type','phone','website','evidence_notes','buy_box','status','call_notes','call_script'];
  lim constant jsonb := '{"ext_id":80,"name":200,"state":2,"type":5,"phone":40,"website":300,"evidence_notes":4000,"buy_box":8000,"call_notes":4000,"call_script":8000}';
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'p_rows must be a non-empty array'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'at most 200 rows per call'; end if;
  for d in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if jsonb_typeof(d) <> 'object' then raise exception 'row %: must be an object', i; end if;
    for k, v in select * from jsonb_each(d) loop
      if not (k = any(ak)) then raise exception 'row %: unknown key "%" (allowed: %)', i, k, array_to_string(ak, ', '); end if;
      if jsonb_typeof(v) <> 'string' then raise exception 'row %: % must be text', i, k; end if;
      if k = 'status' then
        if (v #>> '{}') not in ('To call','Called','Buy box received','Not buying') then raise exception 'row %: status must be one of To call, Called, Buy box received, Not buying', i; end if;
      elsif k = 'type' then
        if (v #>> '{}') not in ('land','homes') then raise exception 'row %: type must be land or homes', i; end if;
      elsif k = 'state' then
        if (v #>> '{}') !~ '^[A-Z]{2}$' then raise exception 'row %: state must be 2 uppercase letters', i; end if;
      elsif k = 'website' then
        if (v #>> '{}') !~* '^https?://' then raise exception 'row %: website must start with http:// or https://', i; end if;
      end if;
      if length(v #>> '{}') > coalesce((lim ->> k)::int, 100000) then raise exception 'row %: % too long (%)', i, k, lim ->> k; end if;
    end loop;
    xid := d ->> 'ext_id';
    if xid is null or length(btrim(xid)) = 0 then raise exception 'row %: ext_id required', i; end if;
    if not exists (select 1 from public.wholesale_builders where ext_id = xid)
       and (coalesce(btrim(d ->> 'name'), '') = '' or (d ->> 'state') is null or (d ->> 'type') is null) then
      raise exception 'row %: new builder needs name, state and type', i; end if;
    if d ? 'name' and length(btrim(d ->> 'name')) = 0 then raise exception 'row %: name cannot be empty', i; end if;
  end loop;
  for d in select * from jsonb_array_elements(p_rows) loop
    xid := d ->> 'ext_id';
    if exists (select 1 from public.wholesale_builders where ext_id = xid) then
      update public.wholesale_builders w set
        name = case when d ? 'name' then d ->> 'name' else w.name end,
        state = case when d ? 'state' then d ->> 'state' else w.state end,
        type = case when d ? 'type' then d ->> 'type' else w.type end,
        phone = case when d ? 'phone' then d ->> 'phone' else w.phone end,
        website = case when d ? 'website' then d ->> 'website' else w.website end,
        evidence_notes = case when d ? 'evidence_notes' then d ->> 'evidence_notes' else w.evidence_notes end,
        buy_box = case when d ? 'buy_box' then d ->> 'buy_box' else w.buy_box end,
        status = case when d ? 'status' then d ->> 'status' else w.status end,
        call_notes = case when d ? 'call_notes' then d ->> 'call_notes' else w.call_notes end,
        call_script = case when d ? 'call_script' then d ->> 'call_script' else w.call_script end
      where w.ext_id = xid;
      upd := upd + 1;
    else
      insert into public.wholesale_builders(ext_id, name, state, type, phone, website, evidence_notes, buy_box, status, call_notes, call_script)
      values (xid, d ->> 'name', d ->> 'state', d ->> 'type', d ->> 'phone', d ->> 'website', d ->> 'evidence_notes', d ->> 'buy_box',
        coalesce(d ->> 'status', 'To call'), d ->> 'call_notes', d ->> 'call_script');
      ins := ins + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_builders));
end $$;
create or replace function public.builders_list(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w) - 'id' - 'created_at' order by w.state, w.type, w.name), '[]'::jsonb) from public.wholesale_builders w);
end $$;
revoke all on function public.builders_upsert(text, jsonb) from public;
revoke all on function public.builders_list(text) from public;
grant execute on function public.builders_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.builders_list(text) to anon, authenticated;
