-- Web push subscriptions for the team app (not yet applied).
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
create policy "own subs select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own subs insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "own subs update" on public.push_subscriptions for update using (user_id = auth.uid());
create policy "own subs delete" on public.push_subscriptions for delete using (user_id = auth.uid());
