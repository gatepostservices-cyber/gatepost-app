-- Prompt inbox (Unfinished panel): Christian jots prompts, then sends them all to Alfred in one message. Admin only.
create table if not exists public.prompt_inbox (
  id bigint generated always as identity primary key,
  text text not null check (length(btrim(text)) > 0 and length(text) <= 4000),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists prompt_inbox_sent_idx on public.prompt_inbox (sent_at, created_at);
alter table public.prompt_inbox enable row level security;
revoke all on public.prompt_inbox from anon;
grant select, insert, update, delete on public.prompt_inbox to authenticated;
drop policy if exists "prompt_inbox admin all" on public.prompt_inbox;
create policy "prompt_inbox admin all" on public.prompt_inbox for all to authenticated using (public.is_admin()) with check (public.is_admin());
