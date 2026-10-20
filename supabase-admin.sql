-- Gatepost Admin (2026-10-20). Additive: new tables + token RPCs; tightens items RLS to admins only.
create table if not exists public.price_book (id bigint generated always as identity primary key, service text not null, unit text, rate numeric, notes text, source text, updated_at timestamptz not null default now());
create table if not exists public.job_log (id bigint generated always as identity primary key, ref text, service text, listed_price numeric, actual_price numeric, job_date date, notes text, created_by text default public.my_email(), created_at timestamptz not null default now());
create table if not exists public.leads (id bigint generated always as identity primary key, name text, work text, phone text, nextdoor_post_url text, message text, source text default 'nextdoor', status text not null default 'new', ext_key text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.texts (id bigint generated always as identity primary key, ext_key text unique, phone text not null, name text, work text, body text, direction text default 'in', sent_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.lead_matches (id bigint generated always as identity primary key, lead_id bigint not null references public.leads(id) on delete cascade, text_id bigint not null references public.texts(id) on delete cascade, status text not null default 'possible' check (status in ('possible','confirmed','rejected')), auto boolean not null default false, decided_by text, decided_at timestamptz, created_at timestamptz not null default now(), unique (lead_id, text_id));
create table if not exists public.call_notes (id bigint generated always as identity primary key, phone text not null unique, body text, file_modified timestamptz, updated_at timestamptz not null default now());
create table if not exists public.bot_notes (id bigint generated always as identity primary key, text text not null, created_by text default public.my_email(), created_at timestamptz not null default now(), read_at timestamptz);

do $$ declare t text; begin
  foreach t in array array['price_book','job_log','leads','texts','lead_matches','call_notes','bot_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format('create policy "admin all" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop; end $$;

create or replace function private.norm_phone(p text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(p,''),'\D','','g'),10) $$;
create or replace function private.norm_txt(p text) returns text language sql immutable as $$ select lower(regexp_replace(trim(coalesce(p,'')),'\s+',' ','g')) $$;

-- Matching: confirmed automatically ONLY when name AND work match exactly (case/space-insensitive); otherwise 'possible'.
create or replace function private.match_text(p_text_id bigint) returns void language plpgsql security definer set search_path to 'public','private' as $$
declare t public.texts; l record;
begin
  select * into t from public.texts where id = p_text_id; if t.id is null then return; end if;
  for l in select * from public.leads where status <> 'closed' loop
    if norm_txt(t.name) <> '' and norm_txt(t.name) = norm_txt(l.name) and norm_txt(t.work) <> '' and norm_txt(t.work) = norm_txt(l.work) then
      insert into public.lead_matches(lead_id,text_id,status,auto,decided_by,decided_at) values (l.id,t.id,'confirmed',true,'auto',now())
        on conflict (lead_id,text_id) do nothing;
      update public.leads set phone = coalesce(phone, norm_phone(t.phone)), status = case when status='new' then 'matched' else status end, updated_at=now() where id = l.id;
    elsif (norm_txt(t.name) <> '' and (norm_txt(t.name) = norm_txt(l.name) or split_part(norm_txt(t.name),' ',1) = split_part(norm_txt(l.name),' ',1)))
       or (norm_txt(t.work) <> '' and norm_txt(t.work) = norm_txt(l.work))
       or (l.phone is not null and norm_phone(l.phone) = norm_phone(t.phone)) then
      insert into public.lead_matches(lead_id,text_id,status) values (l.id,t.id,'possible') on conflict (lead_id,text_id) do nothing;
    end if;
  end loop;
end $$;

create or replace function public.leads_upsert(p_token text, p_ext_key text, p_name text, p_work text, p_nextdoor_post_url text default null, p_message text default null, p_source text default 'nextdoor', p_phone text default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare r public.leads;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_ext_key),'') = '' or coalesce(trim(p_name),'') = '' then raise exception 'ext_key and name are required'; end if;
  insert into public.leads(ext_key,name,work,nextdoor_post_url,message,source,phone)
  values (left(trim(p_ext_key),200), left(trim(p_name),120), left(trim(coalesce(p_work,'')),200), left(p_nextdoor_post_url,500), left(p_message,4000), left(coalesce(nullif(trim(p_source),''),'nextdoor'),40), nullif(private.norm_phone(p_phone),''))
  on conflict (ext_key) do update set name=excluded.name, work=excluded.work, nextdoor_post_url=coalesce(excluded.nextdoor_post_url, leads.nextdoor_post_url),
    message=coalesce(excluded.message, leads.message), source=excluded.source, phone=coalesce(excluded.phone, leads.phone), updated_at=now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;

create or replace function public.texts_upsert(p_token text, p_ext_key text, p_phone text, p_body text, p_name text default null, p_work text default null, p_sent_at timestamptz default null, p_direction text default 'in')
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare r public.texts;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_ext_key),'') = '' or private.norm_phone(p_phone) = '' then raise exception 'ext_key and phone are required'; end if;
  insert into public.texts(ext_key,phone,body,name,work,sent_at,direction)
  values (left(trim(p_ext_key),200), private.norm_phone(p_phone), left(p_body,8000), left(trim(p_name),120), left(trim(p_work),200), coalesce(p_sent_at, now()), case when p_direction='out' then 'out' else 'in' end)
  on conflict (ext_key) do update set name=coalesce(excluded.name, texts.name), work=coalesce(excluded.work, texts.work), body=excluded.body
  returning * into r;
  perform private.match_text(r.id);
  return jsonb_build_object('id', r.id, 'matches', (select coalesce(jsonb_agg(jsonb_build_object('lead_id',lead_id,'status',status)),'[]') from public.lead_matches where text_id=r.id));
end $$;

create or replace function public.call_notes_upsert(p_token text, p_phone text, p_body text, p_modified timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare r public.call_notes;
begin
  perform private.unfinished_check_token(p_token);
  if private.norm_phone(p_phone) = '' then raise exception 'phone is required'; end if;
  insert into public.call_notes(phone,body,file_modified) values (private.norm_phone(p_phone), left(p_body,50000), p_modified)
  on conflict (phone) do update set body=excluded.body, file_modified=excluded.file_modified, updated_at=now() returning * into r;
  return jsonb_build_object('id', r.id, 'phone', r.phone);
end $$;

create or replace function public.bot_notes_unread(p_token text) returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
begin perform private.unfinished_check_token(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'created_by',created_by,'created_at',created_at) order by id),'[]') from public.bot_notes where read_at is null); end $$;
create or replace function public.bot_notes_mark_read(p_token text, p_ids bigint[]) returns integer language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare n integer; begin perform private.unfinished_check_token(p_token);
  update public.bot_notes set read_at = now() where id = any(p_ids) and read_at is null; get diagnostics n = row_count; return n; end $$;

revoke all on function public.leads_upsert(text,text,text,text,text,text,text,text), public.texts_upsert(text,text,text,text,text,text,timestamptz,text), public.call_notes_upsert(text,text,text,timestamptz), public.bot_notes_unread(text), public.bot_notes_mark_read(text,bigint[]) from public;
grant execute on function public.leads_upsert(text,text,text,text,text,text,text,text), public.texts_upsert(text,text,text,text,text,text,timestamptz,text), public.call_notes_upsert(text,text,text,timestamptz), public.bot_notes_unread(text), public.bot_notes_mark_read(text,bigint[]) to anon, authenticated;
revoke all on function private.match_text(bigint) from public;

-- Owner Confirm/Reject on a possible match.
create or replace function public.decide_match(p_id bigint, p_status text) returns void language plpgsql security definer set search_path to 'public','private' as $$
declare m public.lead_matches; begin
  if not public.is_owner() then raise exception 'owners only'; end if;
  if p_status not in ('confirmed','rejected') then raise exception 'bad status'; end if;
  update public.lead_matches set status=p_status, decided_by=public.my_email(), decided_at=now() where id=p_id returning * into m;
  if p_status='confirmed' then update public.leads l set phone=coalesce(l.phone,(select phone from public.texts where id=m.text_id)), status=case when l.status='new' then 'matched' else l.status end, updated_at=now() where l.id=m.lead_id; end if;
end $$;
revoke all on function public.decide_match(bigint,text) from public, anon; grant execute on function public.decide_match(bigint,text) to authenticated;

-- Customer timeline (confirmed customers = leads with a phone from a confirmed match, or quotes with a phone). Invoker view -> RLS applies.
create or replace view public.customer_timeline with (security_invoker = true) as
  select private.norm_phone(l.phone) phone, 'lead' kind, l.created_at at_, l.name who, coalesce(l.work,'') || coalesce(' — ' || l.message,'') body, l.nextdoor_post_url url from public.leads l where l.phone is not null
  union all select t.phone, 'text', coalesce(t.sent_at,t.created_at), t.name, t.body, null from public.texts t
    where exists (select 1 from public.lead_matches m where m.text_id=t.id and m.status='confirmed')
  union all select private.norm_phone(q.customer->>'phone'), 'quote', q.created_at, q.customer->>'name', coalesce(q.service,'') || ' — $' || coalesce(q.total::text,''), null from public.quotes q where coalesce(q.customer->>'phone','') <> ''
  union all select c.phone, 'call', coalesce(c.file_modified,c.updated_at), null, c.body, null from public.call_notes c;
revoke all on public.customer_timeline from anon; grant select on public.customer_timeline to authenticated;

-- Tighten: team data is admins (Christian + Nate) only; drop the employee branch on items.
drop policy if exists "read by role" on public.items; create policy "read by role" on public.items for select to authenticated using (public.is_admin());
drop policy if exists "update by role" on public.items; create policy "update by role" on public.items for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "insert by role" on public.items; create policy "insert by role" on public.items for insert to authenticated with check (created_by = public.my_email() and public.is_admin() and kind = any (array['estimate','event']));

-- Launcher seed (per-user permissions.launcher).
update public.profiles set permissions = permissions || '{"launcher":["fe067e3a-c664-5d47-bbcb-e92f394a76a6","20bbeb34-ce2b-546b-bcaf-471275c29022","4606ba13-0fbd-4caf-9d5e-982b7ecd0a9d","ee0d9746-08c7-469c-bb15-a6664fcbd659","7ed5d130-2b5c-4285-9285-1e9b8b65814b"]}'::jsonb where email='moseley0christian@icloud.com';
update public.profiles set permissions = permissions || '{"launcher":["fe067e3a-c664-5d47-bbcb-e92f394a76a6","20bbeb34-ce2b-546b-bcaf-471275c29022","4606ba13-0fbd-4caf-9d5e-982b7ecd0a9d","ee0d9746-08c7-469c-bb15-a6664fcbd659"]}'::jsonb where email='nmessina@gatepost.services';
