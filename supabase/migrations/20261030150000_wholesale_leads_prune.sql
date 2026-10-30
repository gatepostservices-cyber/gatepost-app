-- Wholesale Hub: prune leads that dropped out of Dex's CSVs after a rescore (2026-10-30). ADDITIVE ONLY. Run after 20261030130000_wholesale_state_split.sql.
-- NOTHING IS EVER DELETED. wholesale_leads gets archived_at + archived_reason.
--   * wholesale_leads_prune(token, pipeline, keep_ext_ids) looks at the rows of ONE pipeline (nm-homes | nm-land | oh-homes = state + type) whose ext_id is NOT in the list:
--       - untouched rows (status = 'New' and no call notes): archived_at = now(), archived_reason = 'Dropped by rescore'  -> hidden from lists and counts
--       - rows Christian worked (status <> 'New' or call_notes not empty): archived_reason = 'Dropped by rescore' only -> stay visible, the hub shows a badge
--     rows already archived / tagged are left alone. p_dry_run = true only counts. Safety: it refuses to touch more than half of a pipeline's visible rows (a broken or empty CSV)
--     unless p_force = true. Same token check as the other wholesale RPCs.
--   * wholesale_leads_upsert is recreated so a later load that contains an ext_id un-archives it (archived_at and archived_reason back to null).
--   * wholesale_leads_counts (the tappable numbers) skips archived rows; wholesale_leads_stats reports archived / dropped flags.
alter table public.wholesale_leads add column if not exists archived_at timestamptz;
alter table public.wholesale_leads add column if not exists archived_reason text;
alter table public.wholesale_leads drop constraint if exists wholesale_leads_archived_reason_check;
alter table public.wholesale_leads add constraint wholesale_leads_archived_reason_check check (length(archived_reason) <= 200);
create index if not exists wholesale_leads_archived_idx on public.wholesale_leads (archived_at) where archived_at is not null;

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
      note = excluded.note, owner_name = excluded.owner_name, owner_mail = excluded.owner_mail, owner_mail_state = excluded.owner_mail_state, details = excluded.details, data_date = excluded.data_date, loaded_at = now(), archived_at = null, archived_reason = null
    returning (xmax = 0) as is_new)
  select count(*) filter (where is_new), count(*) filter (where not is_new) into ins, upd from up;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'total', (select count(*) from public.wholesale_leads));
end $$;

create or replace function public.wholesale_leads_counts() returns table(state text, type text, bucket text, n int, worked int)
language sql stable security invoker set search_path to 'public' as $$
  select l.state, l.type, l.bucket, count(*)::int, (count(*) filter (where l.status <> 'New'))::int from public.wholesale_leads l where l.archived_at is null group by 1, 2, 3 $$;

create or replace function public.wholesale_leads_stats(p_token text) returns jsonb language plpgsql security definer
set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'type', type, 'bucket', bucket, 'status', status, 'archived', archived, 'dropped', dropped, 'n', n) order by state, type, bucket, status, archived, dropped), '[]'::jsonb)
    from (select state, type, bucket, status, (archived_at is not null) archived, (archived_reason is not null) dropped, count(*) n from public.wholesale_leads group by 1, 2, 3, 4, 5, 6) s);
end $$;

create or replace function public.wholesale_leads_prune(p_token text, p_pipeline text, p_keep_ext_ids text[], p_dry_run boolean default false, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public', 'private', 'extensions' as $$
declare v_hash text; v_state text; v_type text; v_active int; v_arch int; v_tag int; v_kept int; v_missing int;
begin
  select value into v_hash from private.settings where key = 'wholesale_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then raise exception 'invalid token' using errcode = '28000'; end if;
  if p_pipeline = 'nm-homes' then v_state := 'NM'; v_type := 'homes';
  elsif p_pipeline = 'nm-land' then v_state := 'NM'; v_type := 'land';
  elsif p_pipeline = 'oh-homes' then v_state := 'OH'; v_type := 'homes';
  else raise exception 'pipeline must be nm-homes, nm-land or oh-homes'; end if;
  if p_keep_ext_ids is null or coalesce(array_length(p_keep_ext_ids, 1), 0) = 0 then raise exception 'keep_ext_ids must not be empty'; end if;
  if array_length(p_keep_ext_ids, 1) > 60000 then raise exception 'at most 60000 ids'; end if;
  create temporary table if not exists _prune_keep (k text primary key) on commit drop;
  truncate _prune_keep;
  insert into _prune_keep select distinct x from unnest(p_keep_ext_ids) x where x is not null;
  select count(*) into v_active from public.wholesale_leads l where l.state = v_state and l.type = v_type and l.archived_at is null;
  select count(*) filter (where l.status = 'New' and coalesce(btrim(l.call_notes), '') = '' and l.archived_at is null),
         count(*) filter (where (l.status <> 'New' or coalesce(btrim(l.call_notes), '') <> '') and l.archived_at is null and l.archived_reason is null)
    into v_arch, v_tag
    from public.wholesale_leads l where l.state = v_state and l.type = v_type and l.ext_id not in (select k from _prune_keep);
  select count(*) into v_kept from public.wholesale_leads l where l.state = v_state and l.type = v_type and l.archived_at is null and l.ext_id in (select k from _prune_keep);
  select count(*) into v_missing from _prune_keep k where not exists (select 1 from public.wholesale_leads l where l.ext_id = k.k);
  if not p_dry_run then
    if not p_force and v_active > 0 and (v_arch + v_tag) * 2 > v_active then
      raise exception 'refusing: % of % visible % rows are not in the list (more than half); check the CSV, or pass force', v_arch + v_tag, v_active, p_pipeline; end if;
    update public.wholesale_leads l set archived_at = now(), archived_reason = 'Dropped by rescore'
      where l.state = v_state and l.type = v_type and l.archived_at is null and l.status = 'New' and coalesce(btrim(l.call_notes), '') = '' and l.ext_id not in (select k from _prune_keep);
    update public.wholesale_leads l set archived_reason = 'Dropped by rescore'
      where l.state = v_state and l.type = v_type and l.archived_at is null and l.archived_reason is null and (l.status <> 'New' or coalesce(btrim(l.call_notes), '') <> '') and l.ext_id not in (select k from _prune_keep);
  end if;
  return jsonb_build_object('pipeline', p_pipeline, 'dry_run', p_dry_run, 'visible_before', v_active, 'archived', v_arch, 'tagged', v_tag, 'kept', v_kept, 'in_list_not_in_db', v_missing);
end $$;

revoke all on function public.wholesale_leads_upsert(text, jsonb) from public;
revoke all on function public.wholesale_leads_stats(text) from public;
revoke all on function public.wholesale_leads_prune(text, text, text[], boolean, boolean) from public;
grant execute on function public.wholesale_leads_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.wholesale_leads_stats(text) to anon, authenticated;
grant execute on function public.wholesale_leads_prune(text, text, text[], boolean, boolean) to anon, authenticated;
