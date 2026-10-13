-- Bot activity log (Town v2). Admins read; bots write via post_activity(token, bot, text, eta).
create table if not exists public.bot_activity (
  id bigint generated always as identity primary key,
  bot text not null check (bot in ('Gatepost','Gatepost Leads','Gatepost Bids','Gatepost Tasks','Gatepost App')),
  body text not null check (length(body) between 1 and 2000),
  eta text check (eta is null or length(eta) <= 120),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bot_activity_bot_idx on public.bot_activity (bot, created_at desc);
alter table public.bot_activity enable row level security;
revoke all on public.bot_activity from anon, authenticated;
grant select on public.bot_activity to authenticated;
drop policy if exists "admin read activity" on public.bot_activity;
create policy "admin read activity" on public.bot_activity for select to authenticated using (public.is_admin());

-- p_eta: free text like "Today 3 PM" or "~20 min". Pass null with p_done=true to mark the current job finished.
create or replace function public.post_activity(p_token text, p_bot text, p_text text, p_eta text default null, p_done boolean default false)
returns bigint language plpgsql security definer set search_path = public, private, extensions as $$
declare v_id bigint; v_hash text;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if coalesce(trim(p_text),'') = '' then raise exception 'text is required'; end if;
  insert into public.bot_activity(bot, body, eta, done) values (p_bot, left(p_text,2000), nullif(trim(coalesce(p_eta,'')),''), coalesce(p_done,false)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_activity(text,text,text,text,boolean) from public;
grant execute on function public.post_activity(text,text,text,text,boolean) to anon, authenticated;
do $$ begin alter publication supabase_realtime add table public.bot_activity; exception when others then null; end $$;
