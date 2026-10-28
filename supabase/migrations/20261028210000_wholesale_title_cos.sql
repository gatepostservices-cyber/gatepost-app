-- Wholesale Hub: Title Companies (2026-10-28). ADDITIVE ONLY. Run after 20261028190000_wholesale_types.sql.
-- Owner-only (has_hub('wholesale'): is_owner AND a hub_access row). Business contact data for title companies; no property-owner names or mailing addresses.
-- The app can change ONLY status and call_notes; rows are created/edited by title_upsert (token), used by tools/title.sh.
create table if not exists public.wholesale_title_cos (
  id uuid primary key default gen_random_uuid(),
  ext_id text not null unique check (length(ext_id) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 200),
  state text not null check (state ~ '^[A-Z]{2}$'),
  phone text check (length(phone) <= 40),
  website text check (length(website) <= 300 and website ~* '^https?://'),
  office_address text check (length(office_address) <= 300),
  contact_person text check (length(contact_person) <= 120),
  evidence_notes text check (length(evidence_notes) <= 4000),
  status text not null default 'To call' check (status in ('To call', 'Called', 'Approved', 'Rejected')),
  call_notes text check (length(call_notes) <= 4000),
  call_script text check (length(call_script) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.wholesale_title_cos enable row level security;
drop policy if exists "wholesale_title_cos owner read" on public.wholesale_title_cos;
create policy "wholesale_title_cos owner read" on public.wholesale_title_cos for select to authenticated using ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_title_cos owner update" on public.wholesale_title_cos;
create policy "wholesale_title_cos owner update" on public.wholesale_title_cos for update to authenticated
  using ((select public.has_hub('wholesale'))) with check ((select public.has_hub('wholesale')));
revoke all on public.wholesale_title_cos from anon, authenticated;
grant select on public.wholesale_title_cos to authenticated;
grant update (status, call_notes) on public.wholesale_title_cos to authenticated;
drop trigger if exists wholesale_title_cos_touch on public.wholesale_title_cos;
create trigger wholesale_title_cos_touch before update on public.wholesale_title_cos for each row execute function public.touch_updated_at();

-- Token RPCs for tools/title.sh (same token hash as wholesale_set). Unknown keys rejected. Keys left out of an existing row are untouched,
-- so a re-run without status / call_notes keeps Christian's edits. New rows need name + state (status defaults to 'To call').
create or replace function public.title_upsert(p_token text, p_cos jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; i int := 0; ins int := 0; upd int := 0; xid text;
  ak constant text[] := array['ext_id','name','state','phone','website','office_address','contact_person','evidence_notes','status','call_notes','call_script'];
  lim constant jsonb := '{"ext_id":80,"name":200,"state":2,"phone":40,"website":300,"office_address":300,"contact_person":120,"evidence_notes":4000,"call_notes":4000,"call_script":8000}';
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_cos is null or jsonb_typeof(p_cos) <> 'array' or jsonb_array_length(p_cos) = 0 then raise exception 'p_cos must be a non-empty array'; end if;
  if jsonb_array_length(p_cos) > 200 then raise exception 'at most 200 companies per call'; end if;
  for d in select * from jsonb_array_elements(p_cos) loop
    i := i + 1;
    if jsonb_typeof(d) <> 'object' then raise exception 'row %: must be an object', i; end if;
    for k, v in select * from jsonb_each(d) loop
      if not (k = any(ak)) then raise exception 'row %: unknown key "%" (allowed: %)', i, k, array_to_string(ak, ', '); end if;
      if jsonb_typeof(v) <> 'string' then raise exception 'row %: % must be text', i, k; end if;
      if k = 'status' then
        if (v #>> '{}') not in ('To call','Called','Approved','Rejected') then raise exception 'row %: status must be one of To call, Called, Approved, Rejected', i; end if;
      elsif k = 'state' then
        if (v #>> '{}') !~ '^[A-Z]{2}$' then raise exception 'row %: state must be 2 uppercase letters', i; end if;
      elsif k = 'website' then
        if (v #>> '{}') !~* '^https?://' then raise exception 'row %: website must start with http:// or https://', i; end if;
      end if;
      if length(v #>> '{}') > (lim ->> k)::int then raise exception 'row %: % too long (%)', i, k, lim ->> k; end if;
    end loop;
    xid := d ->> 'ext_id';
    if xid is null or length(btrim(xid)) = 0 then raise exception 'row %: ext_id required', i; end if;
    if not exists (select 1 from public.wholesale_title_cos where ext_id = xid) and (coalesce(btrim(d ->> 'name'), '') = '' or (d ->> 'state') is null) then
      raise exception 'row %: new company needs name and state', i; end if;
    if d ? 'name' and length(btrim(d ->> 'name')) = 0 then raise exception 'row %: name cannot be empty', i; end if;
  end loop;
  for d in select * from jsonb_array_elements(p_cos) loop
    xid := d ->> 'ext_id';
    if exists (select 1 from public.wholesale_title_cos where ext_id = xid) then
      update public.wholesale_title_cos w set
        name = case when d ? 'name' then d ->> 'name' else w.name end,
        state = case when d ? 'state' then d ->> 'state' else w.state end,
        phone = case when d ? 'phone' then d ->> 'phone' else w.phone end,
        website = case when d ? 'website' then d ->> 'website' else w.website end,
        office_address = case when d ? 'office_address' then d ->> 'office_address' else w.office_address end,
        contact_person = case when d ? 'contact_person' then d ->> 'contact_person' else w.contact_person end,
        evidence_notes = case when d ? 'evidence_notes' then d ->> 'evidence_notes' else w.evidence_notes end,
        status = case when d ? 'status' then d ->> 'status' else w.status end,
        call_notes = case when d ? 'call_notes' then d ->> 'call_notes' else w.call_notes end,
        call_script = case when d ? 'call_script' then d ->> 'call_script' else w.call_script end
      where w.ext_id = xid;
      upd := upd + 1;
    else
      insert into public.wholesale_title_cos(ext_id, name, state, phone, website, office_address, contact_person, evidence_notes, status, call_notes, call_script)
      values (xid, d ->> 'name', d ->> 'state', d ->> 'phone', d ->> 'website', d ->> 'office_address', d ->> 'contact_person', d ->> 'evidence_notes',
        coalesce(d ->> 'status', 'To call'), d ->> 'call_notes', d ->> 'call_script');
      ins := ins + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_title_cos));
end $$;
create or replace function public.title_list(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w) - 'id' - 'created_at' order by w.state, w.name), '[]'::jsonb) from public.wholesale_title_cos w);
end $$;
revoke all on function public.title_upsert(text, jsonb) from public;
revoke all on function public.title_list(text) from public;
grant execute on function public.title_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.title_list(text) to anon, authenticated;
