-- Done list for the Owners (Christian and Nate), live via Supabase realtime (2026-10-30). ADDITIVE ONLY: two new tables + three token RPCs, nothing existing is altered.
-- Run after 20261030150000_wholesale_leads_prune.sql.
-- Model: ONE card per item per local day (America/Denver). done_items = (item_key, day) with a title; done_changes = what changed during that day, in time order,
-- with who asked (Christian | Nate), which bot, which agent and the change text. done_add upserts the day's item and APPENDS a change, so the same item never shows twice in a day.
-- An identical change (same item/day, asked_by, bot, agent and text) is not added twice, so a retried script call is harmless.
-- Bots write with the same posting token as unfinished_* / post_request (private.settings.request_token_sha256, checked by private.unfinished_check_token).
-- Read: owners only (public.is_owner() = profiles.is_owner), through RLS. The app has NO write access to either table. Both tables are added to the supabase_realtime publication.
create table if not exists public.done_items (
  id bigint generated always as identity primary key,
  item_key text not null check (length(btrim(item_key)) between 1 and 200),
  day date not null,                                         -- America/Denver calendar day the item was worked on
  title text not null check (length(btrim(title)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_key, day));
create index if not exists done_items_day_idx on public.done_items (day desc, updated_at desc);
create table if not exists public.done_changes (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.done_items(id) on delete cascade,
  at timestamptz not null default now(),
  asked_by text not null check (asked_by in ('Christian', 'Nate')),
  bot_name text not null check (length(btrim(bot_name)) between 1 and 80),
  agent_id text not null check (length(btrim(agent_id)) between 1 and 200),
  change text not null check (length(btrim(change)) between 1 and 1000));
create index if not exists done_changes_item_idx on public.done_changes (item_id, at);
create unique index if not exists done_changes_dedupe on public.done_changes (item_id, asked_by, bot_name, agent_id, md5(change));   -- the same change is never stored twice for a card

alter table public.done_items enable row level security;
alter table public.done_changes enable row level security;
revoke all on public.done_items from anon, authenticated;
revoke all on public.done_changes from anon, authenticated;
grant select on public.done_items to authenticated;
grant select on public.done_changes to authenticated;
drop policy if exists "done_items owners read" on public.done_items;
create policy "done_items owners read" on public.done_items for select to authenticated using ((select public.is_owner()));
drop policy if exists "done_changes owners read" on public.done_changes;
create policy "done_changes owners read" on public.done_changes for select to authenticated using ((select public.is_owner()));

-- Realtime: owners get inserts / updates as they happen (RLS applies to the realtime stream too).
do $rt$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'done_items') then
    alter publication supabase_realtime add table public.done_items; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'done_changes') then
    alter publication supabase_realtime add table public.done_changes; end if;
end $rt$;

-- Add a change to today's card for p_item_key (creates the card on the first change of the day). p_title (optional) sets / replaces the card title;
-- without it a new card is titled with the change text and an existing card keeps its title.
create or replace function public.done_add(p_token text, p_agent_id text, p_bot_name text, p_item_key text, p_asked_by text, p_change text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare v_day date := (now() at time zone 'America/Denver')::date; v_item public.done_items; v_key text := btrim(coalesce(p_item_key, '')); v_change text := btrim(coalesce(p_change, ''));
  v_bot text := btrim(coalesce(p_bot_name, '')); v_agent text := btrim(coalesce(p_agent_id, '')); v_title text := nullif(btrim(coalesce(p_title, '')), ''); v_cid bigint; v_dup boolean := false;
begin
  perform private.unfinished_check_token(p_token);
  if v_key = '' or v_change = '' or v_bot = '' or v_agent = '' then raise exception 'agent_id, bot_name, item_key and change are required'; end if;
  if p_asked_by is null or p_asked_by not in ('Christian', 'Nate') then raise exception 'asked_by must be Christian or Nate'; end if;
  if length(v_key) > 200 or length(v_agent) > 200 or length(v_bot) > 80 or length(v_change) > 1000 or length(coalesce(v_title, '')) > 300 then raise exception 'a value is too long (item_key 200, agent_id 200, bot_name 80, change 1000, title 300)'; end if;
  insert into public.done_items(item_key, day, title) values (v_key, v_day, coalesce(v_title, left(v_change, 300)))
    on conflict (item_key, day) do update set title = coalesce(v_title, public.done_items.title), updated_at = now()
    returning * into v_item;
  insert into public.done_changes(item_id, asked_by, bot_name, agent_id, change) values (v_item.id, p_asked_by, v_bot, v_agent, v_change)
    on conflict (item_id, asked_by, bot_name, agent_id, md5(change)) do nothing returning id into v_cid;
  if v_cid is null then v_dup := true; select c.id into v_cid from public.done_changes c where c.item_id = v_item.id and c.asked_by = p_asked_by and c.bot_name = v_bot and c.agent_id = v_agent and md5(c.change) = md5(v_change) limit 1; end if;
  return jsonb_build_object('item_id', v_item.id, 'change_id', v_cid, 'day', v_item.day, 'duplicate', v_dup);
end $$;

-- Read-only list for bots (same token): items of the last p_days local days (default 7), newest first, each with its changes in time order.
create or replace function public.done_list(p_token text, p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public, private, extensions as $$
begin
  perform private.unfinished_check_token(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('item_key', i.item_key, 'day', i.day, 'title', i.title, 'updated_at', i.updated_at,
      'changes', (select coalesce(jsonb_agg(jsonb_build_object('at', c.at, 'asked_by', c.asked_by, 'bot', c.bot_name, 'agent_id', c.agent_id, 'change', c.change) order by c.at, c.id), '[]'::jsonb) from public.done_changes c where c.item_id = i.id))
      order by i.day desc, i.updated_at desc), '[]'::jsonb)
    from public.done_items i where i.day >= (now() at time zone 'America/Denver')::date - greatest(coalesce(p_days, 7), 1) + 1);
end $$;

revoke all on function public.done_add(text, text, text, text, text, text, text) from public;
revoke all on function public.done_list(text, int) from public;
grant execute on function public.done_add(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.done_list(text, int) to anon, authenticated;
