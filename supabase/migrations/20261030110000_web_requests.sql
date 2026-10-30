-- Website quote requests (2026-10-30). ADDITIVE ONLY: one new table + one public RPC. Run after 20261030090000_wholesale_leads.sql.
-- The public website (Wendy's form) can ONLY call submit_web_request(...) (SECURITY DEFINER, granted to anon). There is no anon select / insert / update / delete
-- on the table, so nothing a visitor sends can be read back and nothing can be written except through the RPC's validation.
-- Admins and owners (public.is_admin(), the same check the other Admin Hub tables use, e.g. lead_outreach) can read every request and update status / owner / notes only.
-- ALLOWED ORIGINS (note only): the RPC is public by design and a browser POST to /rest/v1/rpc/* needs no CORS setup on our side; Supabase answers CORS for any origin.
--   The site is expected to call it from https://gatepostservices.com (and www). That is NOT enforced here; the protection is the honeypot, validation and the per-contact rate limit.
create table if not exists public.web_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 160),
  address text check (length(address) <= 200),             -- address or area, as typed
  zip text check (length(zip) <= 10),
  service text check (length(service) <= 100),
  details text check (length(details) <= 3000),
  design text check (length(design) <= 200),               -- optional, from /bid?design=...
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10),   -- photo URLs only (no storage upload yet)
  source_page text check (length(source_page) <= 200),
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  owner text check (length(owner) <= 60),                  -- who is handling it
  notes text check (length(notes) <= 4000),
  phone_key text,                                          -- digits only, for the rate limit
  email_key text,                                          -- lower-case, for the rate limit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null));
create index if not exists web_requests_created_idx on public.web_requests (created_at desc);
create index if not exists web_requests_phone_key_idx on public.web_requests (phone_key, created_at desc) where phone_key is not null;
create index if not exists web_requests_email_key_idx on public.web_requests (email_key, created_at desc) where email_key is not null;
alter table public.web_requests enable row level security;
revoke all on public.web_requests from anon, authenticated;
drop policy if exists "admin read" on public.web_requests;
create policy "admin read" on public.web_requests for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin update" on public.web_requests;
create policy "admin update" on public.web_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.web_requests to authenticated;
grant update (status, owner, notes) on public.web_requests to authenticated;   -- the app changes ONLY these three
drop trigger if exists web_requests_touch on public.web_requests;
create trigger web_requests_touch before update on public.web_requests for each row execute function public.touch_updated_at();

-- Text cleaner for the public RPC: removes HTML tags, control characters and stray angle brackets, trims, empty -> null. keep_nl keeps line breaks (details only).
create or replace function public.web_requests_clean(p text, keep_nl boolean default false) returns text language sql immutable set search_path to 'public' as $f$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), '<[^>]*>', ' ', 'g'),
    case when keep_nl then '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' else '[\x01-\x1f\x7f]' end, ' ', 'g'), '[<>]', '', 'g')), '') $f$;
revoke all on function public.web_requests_clean(text, boolean) from public, anon, authenticated;

-- Public insert-only path. Returns ONLY {"ok":true} or {"ok":false,"error":"<code>"}; codes: name_required, contact_required, phone_invalid, email_invalid,
-- too_long, zip_invalid, photos_invalid, rate_limited, server. The honeypot (p_website, a hidden field real people leave empty) returns {"ok":true} without storing anything.
-- All text is stripped of HTML tags and control characters first. More than 5 stored requests in the last hour from one phone or one email => rate_limited.
create or replace function public.submit_web_request(
  p_name text, p_phone text default null, p_email text default null, p_address text default null, p_zip text default null, p_service text default null,
  p_details text default null, p_design text default null, p_photos jsonb default null, p_source_page text default null, p_website text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  nm text; ph text; em text; ad text; zp text; sv text; dt text; dg text; sp text; pk text; ek text; photos jsonb := '[]'::jsonb; u text; n int;
begin
  nm := public.web_requests_clean(p_name); ph := public.web_requests_clean(p_phone); em := public.web_requests_clean(p_email); ad := public.web_requests_clean(p_address);
  zp := public.web_requests_clean(p_zip); sv := public.web_requests_clean(p_service); dt := public.web_requests_clean(p_details, true); dg := public.web_requests_clean(p_design);
  sp := public.web_requests_clean(p_source_page);
  -- honeypot: silently succeed, store nothing
  if btrim(coalesce(p_website, '')) <> '' then return jsonb_build_object('ok', true); end if;
  if nm is null then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if ph is null and em is null then return jsonb_build_object('ok', false, 'error', 'contact_required'); end if;
  if length(nm) > 100 or length(coalesce(ph, '')) > 40 or length(coalesce(em, '')) > 160 or length(coalesce(ad, '')) > 200 or length(coalesce(sv, '')) > 100
     or length(coalesce(dt, '')) > 3000 or length(coalesce(dg, '')) > 200 or length(coalesce(sp, '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if ph is not null then
    pk := regexp_replace(ph, '\D', '', 'g');
    if length(pk) = 11 and pk like '1%' then pk := substr(pk, 2); end if;   -- +1 / 1- prefix counts as the same number
    if ph !~ '^[0-9 ()+.\-xX#ext]+$' or length(pk) < 7 or length(pk) > 15 then return jsonb_build_object('ok', false, 'error', 'phone_invalid'); end if;
  end if;
  if em is not null then
    ek := lower(em);
    if ek !~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]{2,}$' then return jsonb_build_object('ok', false, 'error', 'email_invalid'); end if;
  end if;
  if zp is not null and zp !~ '^[0-9]{5}(-[0-9]{4})?$' then return jsonb_build_object('ok', false, 'error', 'zip_invalid'); end if;
  if p_photos is not null and p_photos <> 'null'::jsonb then
    if jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 10 then return jsonb_build_object('ok', false, 'error', 'photos_invalid'); end if;
    for u in select jsonb_array_elements_text(p_photos) loop
      u := btrim(u);
      if u !~* '^https?://[^\s<>"'']+$' or length(u) > 500 then return jsonb_build_object('ok', false, 'error', 'photos_invalid'); end if;
      photos := photos || to_jsonb(u);
    end loop;
  end if;
  -- rate limit: more than 5 in the last hour for this phone or this email (serialised per contact so parallel posts cannot slip past)
  if pk is not null then perform pg_advisory_xact_lock(hashtext('web_requests:p:' || pk)); end if;
  if ek is not null then perform pg_advisory_xact_lock(hashtext('web_requests:e:' || ek)); end if;
  select count(*) into n from public.web_requests r
    where r.created_at > now() - interval '1 hour' and ((pk is not null and r.phone_key = pk) or (ek is not null and r.email_key = ek));
  if n >= 5 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.web_requests (name, phone, email, address, zip, service, details, design, photos, source_page, phone_key, email_key)
  values (nm, ph, em, ad, zp, sv, dt, dg, photos, sp, pk, ek);
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'server');
end $$;
revoke all on function public.submit_web_request(text, text, text, text, text, text, text, text, jsonb, text, text) from public;
grant execute on function public.submit_web_request(text, text, text, text, text, text, text, text, jsonb, text, text) to anon, authenticated;
