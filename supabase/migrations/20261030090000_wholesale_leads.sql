-- Wholesale Hub: clickable Leads (2026-10-30). ADDITIVE ONLY: one new table, one trigger fn, three functions, nothing existing is altered or dropped.
-- Run after 20261028230000_wholesale_builders.sql. Owner-only (has_hub('wholesale') = is_owner AND a hub_access row), same as the other wholesale tables.
-- Owner contact data is allowed here (Christian approved it 2026-10-30; owner-only RLS): owner_name, owner_mail (the owner's mailing address as one line) and
-- owner_mail_state. owner_flag is a category such as "individual"; absentee / out_of_state are 0/1 flags. The upsert RPC accepts ONLY those three owner keys at the top
-- level and still rejects any other owner/mail key (and any owner/mail key inside details).
-- Loaded from Dex's CSVs by tools/wholesale_leads.sh via wholesale_leads_upsert (token RPC). The upsert NEVER writes status, call_notes or touched_at,
-- so re-loading the files cannot overwrite what Christian sets in the hub. A lead links to wholesale_deals by the same ext_id (no FK: the deal may not exist).
create table if not exists public.wholesale_leads (
  id uuid primary key default gen_random_uuid(),
  ext_id text not null unique check (length(ext_id) between 1 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  type text not null check (type in ('homes', 'land')),
  market text check (length(market) <= 120),                 -- area / market / region
  bucket text not null check (bucket in ('Call today', 'This week', 'Worth a look')),
  score int not null check (score between 0 and 999),
  address text not null check (length(btrim(address)) between 1 and 300),   -- PROPERTY address or legal description only
  parcel_id text check (length(parcel_id) <= 80),
  why text check (length(why) <= 2000),
  source_url text check (length(source_url) <= 1000 and source_url ~* '^https?://'),
  assessor_url text check (length(assessor_url) <= 1000 and assessor_url ~* '^https?://'),
  note text check (length(note) <= 1000),
  owner_name text check (length(owner_name) <= 200),         -- property owner as recorded by the county / city
  owner_mail text check (length(owner_mail) <= 300),         -- owner's mailing address, one line
  owner_mail_state text check (length(owner_mail_state) <= 10),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and length(details::text) <= 8000),
  data_date date,                                            -- date of the CSV the row came from
  status text not null default 'New' check (status in ('New', 'Called', 'Mail sent', 'Offer drafted', 'Under contract', 'Dead')),
  call_notes text check (length(call_notes) <= 4000),
  touched_at timestamptz,                                    -- last time status / call_notes changed (set by trigger)
  loaded_at timestamptz not null default now(),
  created_at timestamptz not null default now());
create index if not exists wholesale_leads_list_idx on public.wholesale_leads (state, type, bucket, score desc, address);
alter table public.wholesale_leads enable row level security;
drop policy if exists "wholesale_leads owner read" on public.wholesale_leads;
create policy "wholesale_leads owner read" on public.wholesale_leads for select to authenticated using ((select public.has_hub('wholesale')));
drop policy if exists "wholesale_leads owner update" on public.wholesale_leads;
create policy "wholesale_leads owner update" on public.wholesale_leads for update to authenticated
  using ((select public.has_hub('wholesale'))) with check ((select public.has_hub('wholesale')));
revoke all on public.wholesale_leads from anon, authenticated;
grant select on public.wholesale_leads to authenticated;
grant update (status, call_notes) on public.wholesale_leads to authenticated;   -- the app can change ONLY status + call_notes

create or replace function public.wholesale_leads_touch() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status is distinct from old.status or new.call_notes is distinct from old.call_notes then new.touched_at := now(); end if;
  return new;
end $$;
drop trigger if exists wholesale_leads_touch on public.wholesale_leads;
create trigger wholesale_leads_touch before update on public.wholesale_leads for each row execute function public.wholesale_leads_touch();

-- Counts for the tappable numbers (SECURITY INVOKER: RLS applies, so anyone but Christian gets an empty set).
create or replace function public.wholesale_leads_counts() returns table(state text, type text, bucket text, n int, worked int)
language sql stable security invoker set search_path to 'public' as $$
  select l.state, l.type, l.bucket, count(*)::int, (count(*) filter (where l.status <> 'New'))::int from public.wholesale_leads l group by 1, 2, 3 $$;
revoke all on function public.wholesale_leads_counts() from public, anon;
grant execute on function public.wholesale_leads_counts() to authenticated;

-- Token RPC for tools/wholesale_leads.sh (same token hash as wholesale_set / deals_upsert / builders_upsert). Max 500 rows per call.
-- Each row is a FULL row: ext_id, state, type, bucket, score, address required; the other columns (incl. owner_name / owner_mail / owner_mail_state) are replaced (null when left out).
-- status / call_notes / touched_at are never written here.
create or replace function public.wholesale_leads_upsert(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; i int := 0; ins int; upd int;
  ak constant text[] := array['ext_id','state','type','market','bucket','score','address','parcel_id','why','source_url','assessor_url','note','owner_name','owner_mail','owner_mail_state','details','data_date'];
  lim constant jsonb := '{"ext_id":80,"state":2,"type":5,"market":120,"bucket":20,"address":300,"parcel_id":80,"why":2000,"source_url":1000,"assessor_url":1000,"note":1000,"owner_name":200,"owner_mail":300,"owner_mail_state":10,"data_date":10}';
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'p_rows must be a non-empty array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'at most 500 rows per call'; end if;
  for d in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if jsonb_typeof(d) <> 'object' then raise exception 'row %: must be an object', i; end if;
    for k, v in select * from jsonb_each(d) loop
      if not (k = any(ak)) then raise exception 'row %: unknown key "%" (allowed: %)', i, k, array_to_string(ak, ', '); end if;
      if k = 'score' then
        if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,3}$' then raise exception 'row %: score must be an integer 0-999', i; end if;
      elsif k = 'details' then
        if jsonb_typeof(v) <> 'object' then raise exception 'row %: details must be an object', i; end if;
        if length(v::text) > 8000 then raise exception 'row %: details too long (8000)', i; end if;
        declare dk text; begin
          for dk in select jsonb_object_keys(v) loop
            if dk ~* 'mail' or (dk ~* 'owner' and dk <> 'owner_flag') or dk ~* '^(name|phone|email|mailing.*)$' then raise exception 'row %: details key "%" looks like owner/mailing data and is not allowed', i, dk; end if;
          end loop; end;
      else
        if jsonb_typeof(v) <> 'string' then raise exception 'row %: % must be text', i, k; end if;
        if length(v #>> '{}') > (lim ->> k)::int then raise exception 'row %: % too long (%)', i, k, lim ->> k; end if;
        if k = 'state' and (v #>> '{}') !~ '^[A-Z]{2}$' then raise exception 'row %: state must be 2 uppercase letters', i; end if;
        if k = 'type' and (v #>> '{}') not in ('homes','land') then raise exception 'row %: type must be homes or land', i; end if;
        if k = 'bucket' and (v #>> '{}') not in ('Call today','This week','Worth a look') then raise exception 'row %: bucket must be Call today, This week or Worth a look', i; end if;
        if k in ('source_url','assessor_url') and (v #>> '{}') !~* '^https?://' then raise exception 'row %: % must start with http:// or https://', i, k; end if;
        if k = 'data_date' and (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'row %: data_date must be YYYY-MM-DD', i; end if;
      end if;
    end loop;
    if coalesce(btrim(d ->> 'ext_id'), '') = '' then raise exception 'row %: ext_id required', i; end if;
    if (d ->> 'state') is null or (d ->> 'type') is null or (d ->> 'bucket') is null or (d -> 'score') is null or coalesce(btrim(d ->> 'address'), '') = '' then
      raise exception 'row %: state, type, bucket, score and address are required', i; end if;
  end loop;
  if (select count(distinct x ->> 'ext_id') from jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) then raise exception 'duplicate ext_id inside the batch'; end if;
  with up as (
    insert into public.wholesale_leads as w (ext_id, state, type, market, bucket, score, address, parcel_id, why, source_url, assessor_url, note, owner_name, owner_mail, owner_mail_state, details, data_date)
    select x.ext_id, x.state, x.type, x.market, x.bucket, x.score, x.address, x.parcel_id, x.why, x.source_url, x.assessor_url, x.note, x.owner_name, x.owner_mail, x.owner_mail_state, coalesce(x.details, '{}'::jsonb), x.data_date
    from jsonb_to_recordset(p_rows) as x(ext_id text, state text, type text, market text, bucket text, score int, address text, parcel_id text, why text,
      source_url text, assessor_url text, note text, owner_name text, owner_mail text, owner_mail_state text, details jsonb, data_date date)
    on conflict (ext_id) do update set state = excluded.state, type = excluded.type, market = excluded.market, bucket = excluded.bucket, score = excluded.score,
      address = excluded.address, parcel_id = excluded.parcel_id, why = excluded.why, source_url = excluded.source_url, assessor_url = excluded.assessor_url,
      note = excluded.note, owner_name = excluded.owner_name, owner_mail = excluded.owner_mail, owner_mail_state = excluded.owner_mail_state, details = excluded.details, data_date = excluded.data_date, loaded_at = now()
    returning (xmax = 0) as is_new)
  select count(*) filter (where is_new), count(*) filter (where not is_new) into ins, upd from up;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_leads));
end $$;

-- Row counts per state / type / bucket / status for tools/wholesale_leads.sh status.
create or replace function public.wholesale_leads_stats(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'type', type, 'bucket', bucket, 'status', status, 'n', n) order by state, type, bucket, status), '[]'::jsonb)
    from (select state, type, bucket, status, count(*) n from public.wholesale_leads group by 1, 2, 3, 4) s);
end $$;
revoke all on function public.wholesale_leads_upsert(text, jsonb) from public;
revoke all on function public.wholesale_leads_stats(text) from public;
grant execute on function public.wholesale_leads_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.wholesale_leads_stats(text) to anon, authenticated;
