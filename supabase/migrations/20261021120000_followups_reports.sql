-- Follow-up approvals queue + weekly reports (2026-10-21). Additive: two new tables + token RPCs. Admin/owner-only RLS, no anon access.
create table if not exists public.followup_drafts (
  id bigint generated always as identity primary key,
  ext_key text unique,
  lead_id bigint references public.leads(id) on delete set null,
  quote_ref text,
  customer_name text,
  channel text not null default 'text' check (channel in ('text','email')),
  recipient text,
  body text not null,
  day_offset int check (day_offset in (1,3,6)),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','denied','sent')),
  edited_body text,
  decided_by text,
  decided_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists followup_drafts_status_due on public.followup_drafts(status, due_at);
alter table public.followup_drafts enable row level security;
revoke all on public.followup_drafts from anon;
drop policy if exists "admin all" on public.followup_drafts;
create policy "admin all" on public.followup_drafts for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.followup_drafts to authenticated;

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  ext_key text unique,
  kind text not null default 'win_loss',
  title text,
  week_ending date,
  summary text,
  data jsonb not null default '{}'::jsonb,
  posted_by text,
  created_at timestamptz not null default now());
create index if not exists reports_created on public.reports(created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon;
drop policy if exists "admin all" on public.reports;
create policy "admin all" on public.reports for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.reports to authenticated;

-- Bot adds (or refreshes, while still pending) a follow-up draft. Never sends anything.
create or replace function public.followup_draft_upsert(p_token text, p_ext_key text, p_channel text, p_recipient text, p_body text, p_day_offset int, p_due_at timestamptz default null, p_customer_name text default null, p_lead text default null, p_quote_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare lid bigint; r public.followup_drafts;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_ext_key),'') = '' then raise exception 'ext_key is required'; end if;
  if coalesce(p_channel,'') not in ('text','email') then raise exception 'channel must be text/email'; end if;
  if coalesce(p_day_offset,0) not in (1,3,6) then raise exception 'day_offset must be 1/3/6'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'body is required'; end if;
  if coalesce(trim(p_recipient),'') = '' then raise exception 'recipient is required'; end if;
  if coalesce(trim(p_lead),'') <> '' then
    select id into lid from public.leads where ext_key = trim(p_lead);
    if lid is null and trim(p_lead) ~ '^\d+$' then select id into lid from public.leads where id = trim(p_lead)::bigint; end if;
    if lid is null then raise exception 'lead not found: %', left(p_lead,200); end if;
  end if;
  insert into public.followup_drafts(ext_key,lead_id,quote_ref,customer_name,channel,recipient,body,day_offset,due_at)
  values (left(trim(p_ext_key),200), lid, left(p_quote_ref,200), left(p_customer_name,200), p_channel, left(trim(p_recipient),200), left(p_body,4000), p_day_offset, p_due_at)
  on conflict (ext_key) do update set lead_id=excluded.lead_id, quote_ref=excluded.quote_ref, customer_name=excluded.customer_name, channel=excluded.channel,
    recipient=excluded.recipient, body=excluded.body, day_offset=excluded.day_offset, due_at=excluded.due_at
    where public.followup_drafts.status = 'pending'
  returning * into r;
  if r.id is null then select * into r from public.followup_drafts where ext_key = left(trim(p_ext_key),200); end if;
  return jsonb_build_object('id', r.id, 'ext_key', r.ext_key, 'status', r.status);
end $$;
revoke all on function public.followup_draft_upsert(text,text,text,text,text,int,timestamptz,text,text,text) from public;
grant execute on function public.followup_draft_upsert(text,text,text,text,text,int,timestamptz,text,text,text) to anon, authenticated;

-- Bot fetches approved, unsent drafts. send_body = edited body if an owner edited it.
create or replace function public.followup_approved_list(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
begin
  perform private.unfinished_check_token(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'ext_key',ext_key,'channel',channel,'recipient',recipient,'customer_name',customer_name,'quote_ref',quote_ref,
    'day_offset',day_offset,'due_at',due_at,'send_body',coalesce(nullif(edited_body,''),body),'decided_by',decided_by,'decided_at',decided_at) order by due_at nulls last, id)
    from public.followup_drafts where status = 'approved' and sent_at is null), '[]'::jsonb);
end $$;
revoke all on function public.followup_approved_list(text) from public;
grant execute on function public.followup_approved_list(text) to anon, authenticated;

-- Bot marks an approved draft sent (by id or ext_key). Refuses anything not approved.
create or replace function public.followup_mark_sent(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare r public.followup_drafts;
begin
  perform private.unfinished_check_token(p_token);
  select * into r from public.followup_drafts where ext_key = trim(p_id);
  if r.id is null and trim(coalesce(p_id,'')) ~ '^\d+$' then select * into r from public.followup_drafts where id = trim(p_id)::bigint; end if;
  if r.id is null then raise exception 'draft not found: %', left(p_id,200); end if;
  if r.status <> 'approved' then raise exception 'draft % is %, only approved drafts can be marked sent', r.id, r.status; end if;
  update public.followup_drafts set status='sent', sent_at=now() where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status, 'sent_at', r.sent_at);
end $$;
revoke all on function public.followup_mark_sent(text,text) from public;
grant execute on function public.followup_mark_sent(text,text) to anon, authenticated;

-- Bot posts a report. Same ext_key (e.g. win_loss-2026-10-18) replaces the earlier post.
create or replace function public.reports_upsert(p_token text, p_ext_key text, p_kind text, p_title text, p_week_ending date default null, p_summary text default null, p_data jsonb default '{}'::jsonb, p_posted_by text default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare r public.reports;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_ext_key),'') = '' then raise exception 'ext_key is required'; end if;
  if coalesce(trim(p_kind),'') = '' then raise exception 'kind is required'; end if;
  if p_data is not null and jsonb_typeof(p_data) <> 'object' then raise exception 'data must be a JSON object'; end if;
  insert into public.reports(ext_key,kind,title,week_ending,summary,data,posted_by)
  values (left(trim(p_ext_key),200), left(trim(p_kind),60), left(p_title,300), p_week_ending, left(p_summary,8000), coalesce(p_data,'{}'::jsonb), left(coalesce(nullif(trim(p_posted_by),''),'bot'),80))
  on conflict (ext_key) do update set kind=excluded.kind, title=excluded.title, week_ending=excluded.week_ending, summary=excluded.summary, data=excluded.data, posted_by=excluded.posted_by, created_at=now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'ext_key', r.ext_key);
end $$;
revoke all on function public.reports_upsert(text,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.reports_upsert(text,text,text,text,date,text,jsonb,text) to anon, authenticated;
