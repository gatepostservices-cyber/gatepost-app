-- Web push for the team app. Safe to re-run. Applied 2026-10-14.
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
drop policy if exists "own subs select" on public.push_subscriptions;
drop policy if exists "own subs insert" on public.push_subscriptions;
drop policy if exists "own subs update" on public.push_subscriptions;
drop policy if exists "own subs delete" on public.push_subscriptions;
create policy "own subs select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own subs insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own subs update" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own subs delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Server-only config (VAPID private key, webhook secret). RLS on with NO policies = service role only.
-- Values are inserted out-of-band; never commit them.
create table if not exists public.push_config (key text primary key, value text not null);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- Fire-and-forget call to the send-push edge function.
create or replace function public.push_notify(audience text, title text, body text, url text default './')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare sec text;
begin
  select value into sec from public.push_config where key = 'hook_secret';
  if sec is null then return; end if;
  perform net.http_post(
    url := 'https://hssevqgkoeuludwoxyuo.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',sec),
    body := jsonb_build_object('audience',audience,'title',title,'body',left(coalesce(body,''),180),'url',url));
exception when others then null; -- never block the write
end $$;
revoke all on function public.push_notify(text,text,text,text) from public, anon, authenticated;

-- items: new pending request -> admins; team schedule changes (not Outlook-synced) -> admins + employees.
create or replace function public.items_push() returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old); src text;
begin
  src := coalesce(r.data->>'source','');
  if tg_op = 'INSERT' and r.kind = 'request' and coalesce(r.status,'pending') = 'pending' then
    perform public.push_notify('admin', 'New request: ' || coalesce(r.data->>'from', r.created_by, 'agent'), r.data->>'text', './#requests');
  elsif r.kind = 'event' and src <> 'outlook' and coalesce(r.created_by,'') <> 'outlook-sync' then
    if tg_op = 'UPDATE' and new.data is not distinct from old.data then return null; end if;
    perform public.push_notify('team',
      case tg_op when 'INSERT' then 'New on the schedule' when 'UPDATE' then 'Schedule changed' else 'Removed from schedule' end,
      concat_ws(' · ', r.data->>'title', r.data->>'date', r.data->>'time'), './#calendar');
  end if;
  return null;
end $$;
drop trigger if exists items_push on public.items;
create trigger items_push after insert or update or delete on public.items for each row execute function public.items_push();

-- bot chat: message from a bot (not from the admin) -> admins.
create or replace function public.bot_messages_push() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.sender,'') <> 'admin' then
    perform public.push_notify('admin', coalesce(new.bot,'Bot') || ' sent you a message', new.body, './');
  end if;
  return null;
end $$;
drop trigger if exists bot_messages_push on public.bot_messages;
create trigger bot_messages_push after insert on public.bot_messages for each row execute function public.bot_messages_push();
