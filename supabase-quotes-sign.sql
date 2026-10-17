-- Quotes: customer e-signing (in-app + public sign link). Run after supabase-quotes.sql.
alter table public.quotes add column if not exists status text not null default 'Saved';
alter table public.quotes add column if not exists signed_at timestamptz;
alter table public.quotes add column if not exists signer_name text;
alter table public.quotes add column if not exists signature_path text;
alter table public.quotes add column if not exists signed_pdf_path text;
alter table public.quotes add column if not exists sign_token text unique;
alter table public.quotes add column if not exists sign_token_expires_at timestamptz;

update storage.buckets set allowed_mime_types = array['application/pdf', 'application/json', 'image/png'] where id = 'quotes';

-- Admin: make (or reuse) the quote's sign link token. 32 random bytes, base64url (43 chars). Expiry optional (default 30 days, null = none).
create or replace function public.create_quote_sign_link(p_quote_id uuid, p_days int default 30, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare q public.quotes; t text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.signed_at is not null then raise exception 'Quote already signed'; end if;
  if q.has_pending and not q.pending_override then raise exception 'Quote has PENDING prices; override first'; end if;
  if q.sign_token is not null and not p_new and (q.sign_token_expires_at is null or q.sign_token_expires_at > now()) then
    return jsonb_build_object('token', q.sign_token, 'expires_at', q.sign_token_expires_at);
  end if;
  t := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.quotes set sign_token = t,
    sign_token_expires_at = case when p_days is null then null else now() + make_interval(days => p_days) end
    where id = p_quote_id returning sign_token_expires_at into q.sign_token_expires_at;
  return jsonb_build_object('token', t, 'expires_at', q.sign_token_expires_at);
end $$;

-- Is this token usable right now (exists, not signed, not expired, not blocked by PENDING)?
create or replace function public.quote_sign_token_open(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotes q where p_token is not null and length(p_token) >= 43 and q.sign_token = p_token
    and q.signed_at is null and (q.sign_token_expires_at is null or q.sign_token_expires_at > now())
    and (not q.has_pending or q.pending_override));
$$;

-- Public: customer-facing fields only (no inputs, materials cost, guide notes, other quotes).
create or replace function public.get_quote_for_signing(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q public.quotes;
begin
  if p_token is null or length(p_token) < 43 then return jsonb_build_object('error', 'invalid'); end if;
  select * into q from public.quotes where sign_token = p_token;
  if not found then return jsonb_build_object('error', 'invalid'); end if;
  if q.signed_at is not null then return jsonb_build_object('error', 'signed', 'number', q.number, 'signed_at', q.signed_at); end if;
  if q.sign_token_expires_at is not null and q.sign_token_expires_at <= now() then return jsonb_build_object('error', 'expired', 'number', q.number); end if;
  if q.has_pending and not q.pending_override then return jsonb_build_object('error', 'invalid'); end if;
  return jsonb_build_object('number', q.number, 'service', q.service,
    'customer', jsonb_build_object('name', q.customer->>'name', 'addr', q.customer->>'addr', 'city', q.customer->>'city', 'phone', q.customer->>'phone', 'email', q.customer->>'email', 'date', q.customer->>'date', 'scope', q.customer->>'scope'),
    'result', jsonb_build_object('lines', coalesce((select jsonb_agg(jsonb_build_object('l', l->>'l', 'a', (l->>'a')::numeric)) from jsonb_array_elements(q.data->'result'->'lines') l), '[]'::jsonb),
      'subtotal', q.data->'result'->'subtotal', 'grtLabel', q.data->'result'->'grtLabel', 'grtRate', q.data->'result'->'grtRate', 'tax', q.data->'result'->'tax', 'total', q.data->'result'->'total'),
    'expires_at', q.sign_token_expires_at);
end $$;

-- Public: record the signature. The PNG + signed PDF are uploaded first to quotes/sign/<token>/<stamp>.png|.pdf (anon insert policy below).
create or replace function public.submit_quote_signature(p_token text, p_name text, p_signature_path text, p_signed_pdf_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.quotes; pre text := 'sign/' || p_token || '/';
begin
  if not public.quote_sign_token_open(p_token) then
    select * into q from public.quotes where sign_token = p_token;
    if found and q.signed_at is not null then raise exception 'This quote is already signed'; end if;
    raise exception 'This sign link is not valid or has expired';
  end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(p_name) > 120 then raise exception 'Enter your printed name'; end if;
  if p_signature_path not like pre || '%.png' or p_signed_pdf_path not like pre || '%.pdf' then raise exception 'Bad file path'; end if;
  if (select count(*) from storage.objects where bucket_id = 'quotes' and name in (p_signature_path, p_signed_pdf_path)) <> 2 then raise exception 'Upload missing'; end if;
  update public.quotes set signed_at = now(), signer_name = btrim(p_name), signature_path = p_signature_path, signed_pdf_path = p_signed_pdf_path, status = 'Signed'
    where sign_token = p_token and signed_at is null returning * into q;
  if not found then raise exception 'This quote is already signed'; end if;
  return jsonb_build_object('ok', true, 'number', q.number, 'signed_at', q.signed_at);
end $$;

revoke all on function public.create_quote_sign_link(uuid, int, boolean) from public, anon;
grant execute on function public.create_quote_sign_link(uuid, int, boolean) to authenticated;
revoke all on function public.quote_sign_token_open(text) from public;
grant execute on function public.quote_sign_token_open(text) to anon, authenticated;
revoke all on function public.get_quote_for_signing(text) from public;
grant execute on function public.get_quote_for_signing(text) to anon, authenticated;
revoke all on function public.submit_quote_signature(text, text, text, text) from public;
grant execute on function public.submit_quote_signature(text, text, text, text) to anon, authenticated;

-- Anyone holding an open token may add (never read, overwrite or delete) files under sign/<token>/ only.
drop policy if exists "quotes bucket sign-link insert" on storage.objects;
create policy "quotes bucket sign-link insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'quotes' and name ~ '^sign/[A-Za-z0-9_-]{43,}/[0-9]{10,16}\.(pdf|png)$' and public.quote_sign_token_open(split_part(name, '/', 2)));
