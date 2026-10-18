-- "Unfinished" screen: things Christian started with a bot that aren't finished yet.
-- Bots write with the same posting token as post_request (private.settings.request_token_sha256). Admins read/update in the app.
create table if not exists public.unfinished (
  id bigint generated always as identity primary key,
  agent_id text not null,
  bot_name text not null,
  ext_key text not null,
  summary text not null,
  state text not null default '',
  status text not null default 'open' check (status in ('open','done','aborted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  aborted_at timestamptz,
  acked_at timestamptz,
  unique (agent_id, ext_key)
);
create index if not exists unfinished_status_idx on public.unfinished (status, updated_at desc);
alter table public.unfinished enable row level security;
revoke all on public.unfinished from anon;
grant select, update on public.unfinished to authenticated;
drop policy if exists "unfinished admin read" on public.unfinished;
create policy "unfinished admin read" on public.unfinished for select to authenticated using (public.is_admin());
drop policy if exists "unfinished admin update" on public.unfinished;
create policy "unfinished admin update" on public.unfinished for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function private.unfinished_check_token(p_token text) returns void
language plpgsql stable security definer set search_path = public, private, extensions as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
end $$;
revoke all on function private.unfinished_check_token(text) from public;

-- Add or update an item (idempotent on agent_id + ext_key). Aborted/done items are not reopened; text is only updated while open.
create or replace function public.unfinished_upsert(p_token text, p_agent_id text, p_bot_name text, p_ext_key text, p_summary text, p_state text default '')
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.unfinished;
begin
  perform private.unfinished_check_token(p_token);
  if coalesce(trim(p_agent_id),'') = '' or coalesce(trim(p_ext_key),'') = '' or coalesce(trim(p_summary),'') = '' or coalesce(trim(p_bot_name),'') = '' then
    raise exception 'agent_id, bot_name, ext_key and summary are required'; end if;
  insert into public.unfinished (agent_id, bot_name, ext_key, summary, state)
  values (left(trim(p_agent_id),200), left(trim(p_bot_name),80), left(trim(p_ext_key),200), left(trim(p_summary),300), left(coalesce(p_state,''),1000))
  on conflict (agent_id, ext_key) do update set
    bot_name = excluded.bot_name,
    summary = excluded.summary,
    state = case when coalesce(trim(p_state),'') = '' then public.unfinished.state else excluded.state end,
    updated_at = now()
  where public.unfinished.status = 'open'
  returning * into r;
  if r.id is null then select * into r from public.unfinished where agent_id = trim(p_agent_id) and ext_key = trim(p_ext_key); end if;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;

-- Mark an item done.
create or replace function public.unfinished_close(p_token text, p_agent_id text, p_ext_key text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.unfinished;
begin
  perform private.unfinished_check_token(p_token);
  update public.unfinished set status = 'done', updated_at = now() where agent_id = trim(p_agent_id) and ext_key = trim(p_ext_key) and status = 'open' returning * into r;
  if r.id is null then select * into r from public.unfinished where agent_id = trim(p_agent_id) and ext_key = trim(p_ext_key);
    if r.id is null then raise exception 'item not found'; end if; end if;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;

-- Items Christian aborted for this agent that the bot hasn't seen yet; marks them acknowledged.
create or replace function public.unfinished_aborted(p_token text, p_agent_id text)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare out jsonb;
begin
  perform private.unfinished_check_token(p_token);
  with a as (update public.unfinished set acked_at = now() where agent_id = trim(p_agent_id) and status = 'aborted' and acked_at is null
    returning id, ext_key, summary, state, aborted_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ext_key', ext_key, 'summary', summary, 'state', state, 'aborted_at', aborted_at) order by aborted_at), '[]'::jsonb) into out from a;
  return out;
end $$;

revoke all on function public.unfinished_upsert(text,text,text,text,text,text) from public;
revoke all on function public.unfinished_close(text,text,text) from public;
revoke all on function public.unfinished_aborted(text,text) from public;
grant execute on function public.unfinished_upsert(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.unfinished_close(text,text,text) to anon, authenticated;
grant execute on function public.unfinished_aborted(text,text) to anon, authenticated;
