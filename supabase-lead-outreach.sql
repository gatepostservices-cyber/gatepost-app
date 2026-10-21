-- Lead outreach log (2026-10-21). Additive: new table + token RPC. Admin/owner-only RLS, no anon access.
create table if not exists public.lead_outreach (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  channel text not null default 'other' check (channel in ('nextdoor','text','email','call','other')),
  direction text not null default 'out' check (direction in ('out','in')),
  summary text,
  sent_at timestamptz not null default now(),
  sent_by text,
  status text not null default 'sent' check (status in ('sent','replied','no_reply','won','lost')),
  ext_key text unique,
  created_at timestamptz not null default now());
create index if not exists lead_outreach_lead_sent on public.lead_outreach(lead_id, sent_at desc);
alter table public.lead_outreach enable row level security;
revoke all on public.lead_outreach from anon;
drop policy if exists "admin all" on public.lead_outreach;
create policy "admin all" on public.lead_outreach for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.lead_outreach to authenticated;

-- Bots: log outreach. Lead by id or by leads.ext_key. Idempotent when p_ext_key is given.
create or replace function public.lead_outreach_upsert(p_token text, p_lead text, p_channel text, p_summary text, p_direction text default 'out', p_status text default 'sent', p_sent_by text default null, p_sent_at timestamptz default null, p_ext_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare lid bigint; r public.lead_outreach;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_lead),'') = '' then raise exception 'lead is required'; end if;
  select id into lid from public.leads where ext_key = trim(p_lead);
  if lid is null and trim(p_lead) ~ '^\d+$' then select id into lid from public.leads where id = trim(p_lead)::bigint; end if;
  if lid is null then raise exception 'lead not found: %', left(p_lead,200); end if;
  if coalesce(p_channel,'') not in ('nextdoor','text','email','call','other') then raise exception 'channel must be nextdoor/text/email/call/other'; end if;
  if coalesce(p_direction,'out') not in ('out','in') then raise exception 'direction must be out/in'; end if;
  if coalesce(p_status,'sent') not in ('sent','replied','no_reply','won','lost') then raise exception 'status must be sent/replied/no_reply/won/lost'; end if;
  insert into public.lead_outreach(lead_id,channel,direction,summary,sent_at,sent_by,status,ext_key)
  values (lid, p_channel, coalesce(p_direction,'out'), left(p_summary,4000), coalesce(p_sent_at, now()), left(coalesce(nullif(trim(p_sent_by),''),'bot'),80), coalesce(p_status,'sent'), nullif(left(trim(coalesce(p_ext_key,'')),200),''))
  on conflict (ext_key) do update set channel=excluded.channel, direction=excluded.direction, summary=excluded.summary, sent_at=excluded.sent_at, sent_by=excluded.sent_by, status=excluded.status
  returning * into r;
  return jsonb_build_object('id', r.id, 'lead_id', r.lead_id, 'status', r.status);
end $$;
revoke all on function public.lead_outreach_upsert(text,text,text,text,text,text,text,timestamptz,text) from public;
grant execute on function public.lead_outreach_upsert(text,text,text,text,text,text,text,timestamptz,text) to anon, authenticated;
