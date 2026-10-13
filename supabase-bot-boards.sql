-- Bot boards (Town v3b): one live JSON board per (bot, board_key). Admins read; bots publish via post_board(token, ...).
create table if not exists public.bot_boards (
  bot text not null check (bot in ('Gatepost','Gatepost Leads','Gatepost Bids','Gatepost Tasks','Gatepost App')),
  board_key text not null check (board_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 200000),
  updated_at timestamptz not null default now(),
  primary key (bot, board_key)
);
alter table public.bot_boards enable row level security;
revoke all on public.bot_boards from anon, authenticated;
grant select on public.bot_boards to authenticated;
drop policy if exists "admin read boards" on public.bot_boards;
create policy "admin read boards" on public.bot_boards for select to authenticated using (public.is_admin());

-- Replaces the whole row for that bot + key.
create or replace function public.post_board(p_token text, p_bot text, p_board_key text, p_payload jsonb)
returns timestamptz language plpgsql security definer set search_path = public, private, extensions as $$
declare v_hash text; v_at timestamptz;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if p_payload is null then raise exception 'payload is required'; end if;
  insert into public.bot_boards(bot, board_key, payload, updated_at) values (p_bot, p_board_key, p_payload, now())
  on conflict (bot, board_key) do update set payload = excluded.payload, updated_at = now()
  returning updated_at into v_at;
  return v_at;
end $$;
revoke all on function public.post_board(text,text,text,jsonb) from public;
grant execute on function public.post_board(text,text,text,jsonb) to anon, authenticated;

-- One-tap Approve on a board item (admins only): creates an approved request for the bot + an activity entry.
create or replace function public.approve_board_item(p_bot text, p_board_key text, p_title text, p_item jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'title is required'; end if;
  insert into public.items(kind, status, data, created_by, decided_by, decided_at)
  values ('request', 'approved', jsonb_build_object('from', p_bot, 'title', left(p_title,300), 'text', left(p_title,300), 'board', p_board_key, 'boardItem', coalesce(p_item,'{}'::jsonb)),
          public.my_email(), public.my_email(), now())
  returning id into v_id;
  insert into public.bot_activity(bot, body) values (p_bot, left('Approved by Christian: ' || p_title, 2000));
  return v_id;
end $$;
revoke all on function public.approve_board_item(text,text,text,jsonb) from public;
grant execute on function public.approve_board_item(text,text,text,jsonb) to authenticated;
do $$ begin alter publication supabase_realtime add table public.bot_boards; exception when others then null; end $$;
