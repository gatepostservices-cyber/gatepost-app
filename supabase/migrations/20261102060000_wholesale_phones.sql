-- Wholesale Hub: phone numbers on leads (2026-11-02). ADDITIVE ONLY. Run after 20261030170000_done_list.sql.
-- Christian approved building this (publishing is a separate step). Phone data comes from Dex's phones.csv (public listing / agent / owner lookups) and is owner-only like the rest of
-- wholesale_leads: RLS is unchanged (select + update policies use has_hub('wholesale')), anon gets NOTHING, and the app still updates ONLY status + call_notes (no new UPDATE grant).
-- muse_readonly and authenticated already hold table-level SELECT on wholesale_leads, which covers the new columns (no column-level grants apply), so no new grant is needed.
-- New nullable columns: phone, phone_type (owner | agent | company), phone_contact (who it belongs to), phone_source (usually a URL), phone_confidence (high | medium | low).
-- wholesale_leads_upsert (recreated) accepts the five keys at the top level. Update rules, so a reload without phone data never wipes a phone:
--   * a row with no phone_* keys leaves every phone column untouched;
--   * a row WITH a phone replaces the whole phone group (phone, type, contact, source, confidence) so a new number never keeps the old number's type/confidence;
--   * a row with phone_* keys but no phone coalesces them one by one (blank / missing = keep what is there).
--   * a "phone" key inside details is no longer rejected; it is dropped (phones live in the columns, never in details). Other owner / mail keys in details are still rejected.
--   * status, call_notes and touched_at are never written, same as before.
-- wholesale_leads_phones(token, rows) is a phone-only loader for tools/wholesale_phones.sh: keyed on ext_id, updates ONLY the five phone columns of EXISTING leads (never inserts, never touches
--   any other column), so phones.csv does not need the full lead row. Unknown ext_ids are counted and listed. Same token check as the other wholesale RPCs. Max 500 rows per call.
alter table public.wholesale_leads add column if not exists phone text;
alter table public.wholesale_leads add column if not exists phone_type text;
alter table public.wholesale_leads add column if not exists phone_contact text;
alter table public.wholesale_leads add column if not exists phone_source text;
alter table public.wholesale_leads add column if not exists phone_confidence text;
alter table public.wholesale_leads drop constraint if exists wholesale_leads_phone_check;
alter table public.wholesale_leads add constraint wholesale_leads_phone_check check (length(phone) <= 40);
alter table public.wholesale_leads drop constraint if exists wholesale_leads_phone_type_check;
alter table public.wholesale_leads add constraint wholesale_leads_phone_type_check check (phone_type in ('owner', 'agent', 'company'));
alter table public.wholesale_leads drop constraint if exists wholesale_leads_phone_contact_check;
alter table public.wholesale_leads add constraint wholesale_leads_phone_contact_check check (length(phone_contact) <= 200);
alter table public.wholesale_leads drop constraint if exists wholesale_leads_phone_source_check;
alter table public.wholesale_leads add constraint wholesale_leads_phone_source_check check (length(phone_source) <= 1000);
alter table public.wholesale_leads drop constraint if exists wholesale_leads_phone_confidence_check;
alter table public.wholesale_leads add constraint wholesale_leads_phone_confidence_check check (phone_confidence in ('high', 'medium', 'low'));
create index if not exists wholesale_leads_has_phone_idx on public.wholesale_leads (state, type, bucket) where phone is not null;

-- Shared validation for one phone key (raises with the row number). Not callable from the API.
create or replace function private.wholesale_phone_check(i int, k text, v jsonb) returns void language plpgsql immutable set search_path to 'public' as $$
declare t text;
begin
  if jsonb_typeof(v) = 'null' then return; end if;
  if jsonb_typeof(v) <> 'string' then raise exception 'row %: % must be text', i, k; end if;
  t := btrim(v #>> '{}');
  if t = '' then return; end if;
  if k = 'phone' then
    if length(t) > 40 or t !~ '^[0-9+()\-. ]{7,30}(\s*(x|ext\.?)\s*[0-9]{1,6})?$' or length(regexp_replace(t, '\D', '', 'g')) not between 7 and 15 then raise exception 'row %: phone must look like (505) 555-1234 (digits, spaces, ()+-. and an optional x123 extension)', i; end if;
  elsif k = 'phone_type' then
    if t not in ('owner', 'agent', 'company') then raise exception 'row %: phone_type must be owner, agent or company', i; end if;
  elsif k = 'phone_confidence' then
    if t not in ('high', 'medium', 'low') then raise exception 'row %: phone_confidence must be high, medium or low', i; end if;
  elsif k = 'phone_contact' then
    if length(t) > 200 then raise exception 'row %: phone_contact too long (200)', i; end if;
  elsif k = 'phone_source' then
    if length(t) > 1000 then raise exception 'row %: phone_source too long (1000)', i; end if;
  end if;
end $$;
revoke all on function private.wholesale_phone_check(int, text, jsonb) from public, anon, authenticated;

create or replace function public.wholesale_leads_upsert(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; i int := 0; ins int; upd int;
  ak constant text[] := array['ext_id','state','type','market','bucket','score','address','parcel_id','why','source_url','assessor_url','note','owner_name','owner_mail','owner_mail_state','details','data_date',
    'phone','phone_type','phone_contact','phone_source','phone_confidence'];
  pk constant text[] := array['phone','phone_type','phone_contact','phone_source','phone_confidence'];
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
            if dk ~* 'mail' or (dk ~* 'owner' and dk <> 'owner_flag') or dk ~* '^(name|email|mailing.*)$' then raise exception 'row %: details key "%" looks like owner/mailing data and is not allowed', i, dk; end if;
          end loop; end;   -- a "phone" key in details is allowed through the guard and then dropped (phones live in the phone columns)
      elsif k = any(pk) then
        perform private.wholesale_phone_check(i, k, v);
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
    insert into public.wholesale_leads as w (ext_id, state, type, market, bucket, score, address, parcel_id, why, source_url, assessor_url, note, owner_name, owner_mail, owner_mail_state, details, data_date,
      phone, phone_type, phone_contact, phone_source, phone_confidence)
    select x.ext_id, x.state, x.type, x.market, x.bucket, x.score, x.address, x.parcel_id, x.why, x.source_url, x.assessor_url, x.note, x.owner_name, x.owner_mail, x.owner_mail_state, coalesce(x.details, '{}'::jsonb) - 'phone', x.data_date,
      nullif(btrim(x.phone), ''), nullif(btrim(x.phone_type), ''), nullif(btrim(x.phone_contact), ''), nullif(btrim(x.phone_source), ''), nullif(btrim(x.phone_confidence), '')
    from jsonb_to_recordset(p_rows) as x(ext_id text, state text, type text, market text, bucket text, score int, address text, parcel_id text, why text,
      source_url text, assessor_url text, note text, owner_name text, owner_mail text, owner_mail_state text, details jsonb, data_date date,
      phone text, phone_type text, phone_contact text, phone_source text, phone_confidence text)
    on conflict (ext_id) do update set state = excluded.state, type = excluded.type, market = excluded.market, bucket = excluded.bucket, score = excluded.score,
      address = excluded.address, parcel_id = excluded.parcel_id, why = excluded.why, source_url = excluded.source_url, assessor_url = excluded.assessor_url,
      note = excluded.note, owner_name = excluded.owner_name, owner_mail = excluded.owner_mail, owner_mail_state = excluded.owner_mail_state, details = excluded.details, data_date = excluded.data_date, loaded_at = now(), archived_at = null, archived_reason = null,
      -- phones: coalesce-style. No phone data in the row = untouched. A new phone replaces the whole group.
      phone = coalesce(excluded.phone, w.phone),
      phone_type = case when excluded.phone is not null then excluded.phone_type else coalesce(excluded.phone_type, w.phone_type) end,
      phone_contact = case when excluded.phone is not null then excluded.phone_contact else coalesce(excluded.phone_contact, w.phone_contact) end,
      phone_source = case when excluded.phone is not null then excluded.phone_source else coalesce(excluded.phone_source, w.phone_source) end,
      phone_confidence = case when excluded.phone is not null then excluded.phone_confidence else coalesce(excluded.phone_confidence, w.phone_confidence) end
    returning (xmax = 0) as is_new)
  select count(*) filter (where is_new), count(*) filter (where not is_new) into ins, upd from up;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_leads));
end $$;

-- Phone-only loader (tools/wholesale_phones.sh). Rows: {ext_id, phone, phone_type, phone_contact, phone_source, phone_confidence}. Existing leads only.
create or replace function public.wholesale_leads_phones(p_token text, p_rows jsonb, p_dry_run boolean default false) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; d jsonb; k text; v jsonb; i int := 0; upd int := 0; skipped int := 0; nf int := 0; nfl jsonb;
  ak constant text[] := array['ext_id','phone','phone_type','phone_contact','phone_source','phone_confidence'];
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
      if k = 'ext_id' then
        if jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 80 then raise exception 'row %: ext_id must be 1-80 characters', i; end if;
      else perform private.wholesale_phone_check(i, k, v); end if;
    end loop;
    if coalesce(btrim(d ->> 'ext_id'), '') = '' then raise exception 'row %: ext_id required', i; end if;
  end loop;
  if (select count(distinct x ->> 'ext_id') from jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) then raise exception 'duplicate ext_id inside the batch'; end if;
  create temporary table if not exists _phone_rows (ext_id text primary key, phone text, phone_type text, phone_contact text, phone_source text, phone_confidence text) on commit drop;
  truncate _phone_rows;
  insert into _phone_rows select btrim(x.ext_id), nullif(btrim(x.phone), ''), nullif(btrim(x.phone_type), ''), nullif(btrim(x.phone_contact), ''), nullif(btrim(x.phone_source), ''), nullif(btrim(x.phone_confidence), '')
    from jsonb_to_recordset(p_rows) as x(ext_id text, phone text, phone_type text, phone_contact text, phone_source text, phone_confidence text);
  select count(*) into skipped from _phone_rows r where r.phone is null and r.phone_type is null and r.phone_contact is null and r.phone_source is null and r.phone_confidence is null;
  select count(*), coalesce(jsonb_agg(ext_id) filter (where rn <= 20), '[]'::jsonb) into nf, nfl
    from (select r.ext_id, row_number() over (order by r.ext_id) rn from _phone_rows r where not exists (select 1 from public.wholesale_leads l where l.ext_id = r.ext_id)) m;
  select count(*) into upd from _phone_rows r join public.wholesale_leads l on l.ext_id = r.ext_id
    where not (r.phone is null and r.phone_type is null and r.phone_contact is null and r.phone_source is null and r.phone_confidence is null);
  if not p_dry_run then
    update public.wholesale_leads w set
      phone = coalesce(r.phone, w.phone),
      phone_type = case when r.phone is not null then r.phone_type else coalesce(r.phone_type, w.phone_type) end,
      phone_contact = case when r.phone is not null then r.phone_contact else coalesce(r.phone_contact, w.phone_contact) end,
      phone_source = case when r.phone is not null then r.phone_source else coalesce(r.phone_source, w.phone_source) end,
      phone_confidence = case when r.phone is not null then r.phone_confidence else coalesce(r.phone_confidence, w.phone_confidence) end
    from _phone_rows r where r.ext_id = w.ext_id
      and not (r.phone is null and r.phone_type is null and r.phone_contact is null and r.phone_source is null and r.phone_confidence is null);
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'updated', upd, 'skipped_no_phone_data', skipped, 'not_found', nf, 'not_found_sample', nfl,
    'leads_with_phone', (select count(*) from public.wholesale_leads where phone is not null));
end $$;

revoke all on function public.wholesale_leads_upsert(text, jsonb) from public;
revoke all on function public.wholesale_leads_phones(text, jsonb, boolean) from public;
grant execute on function public.wholesale_leads_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.wholesale_leads_phones(text, jsonb, boolean) to anon, authenticated;
