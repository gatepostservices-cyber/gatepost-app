-- Per-bot chat desk (Town v2). Admins read/write; employees and anon get nothing.
create table if not exists public.bot_messages (
  id bigint generated always as identity primary key,
  bot text not null check (bot in ('Gatepost','Gatepost Leads','Gatepost Bids','Gatepost Tasks','Gatepost App')),
  sender text not null check (sender in ('admin','bot')),
  author text not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists bot_messages_bot_idx on public.bot_messages (bot, created_at desc);
alter table public.bot_messages enable row level security;
revoke all on public.bot_messages from anon;
drop policy if exists "admin read chat" on public.bot_messages;
create policy "admin read chat" on public.bot_messages for select to authenticated using (public.is_admin());
drop policy if exists "admin post chat" on public.bot_messages;
create policy "admin post chat" on public.bot_messages for insert to authenticated
  with check (public.is_admin() and sender = 'admin' and author = public.my_email() and read_at is null);
drop policy if exists "admin mark read" on public.bot_messages;
create policy "admin mark read" on public.bot_messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Admins can only change read_at (not rewrite history).
revoke update on public.bot_messages from authenticated;
grant update (read_at) on public.bot_messages to authenticated;

-- Bots reply with the same posting token as post_request.
create or replace function public.post_chat(p_token text, p_bot text, p_text text)
returns bigint language plpgsql security definer set search_path = public, private, extensions as $$
declare v_id bigint; v_hash text;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if coalesce(trim(p_text),'') = '' then raise exception 'text is required'; end if;
  insert into public.bot_messages(bot, sender, author, body) values (p_bot, 'bot', p_bot, left(p_text, 4000)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_chat(text,text,text) from public;
grant execute on function public.post_chat(text,text,text) to anon, authenticated;

-- Let bots read the thread (admin messages to them) with the token.
create or replace function public.read_chat(p_token text, p_bot text, p_limit int default 20)
returns table (id bigint, sender text, author text, body text, created_at timestamptz)
language plpgsql security definer set search_path = public, private, extensions as $$
declare v_hash text;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  return query select m.id, m.sender, m.author, m.body, m.created_at from public.bot_messages m
    where m.bot = p_bot order by m.created_at desc limit least(greatest(p_limit,1),100);
end $$;
revoke all on function public.read_chat(text,text,int) from public;
grant execute on function public.read_chat(text,text,int) to anon, authenticated;

do $$ begin alter publication supabase_realtime add table public.bot_messages; exception when others then null; end $$;
