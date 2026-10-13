-- Gatepost sync backend. Paste into Supabase -> SQL Editor -> Run (once).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('admin','employee')),
  access boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('estimate','event','request')),
  data jsonb not null,
  status text,
  created_by text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- First account becomes admin with access; everyone else starts with 0 access.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  perform pg_advisory_xact_lock(42);
  select not exists(select 1 from public.profiles) into first;
  insert into public.profiles(id,email,role,access)
  values (new.id, lower(new.email), case when first then 'admin' else 'employee' end, first);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_approved() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select access from public.profiles where id = auth.uid()), false) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role='admin' from public.profiles where id = auth.uid()), false) $$;

alter table public.profiles enable row level security;
alter table public.items enable row level security;

drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "admin update" on public.profiles;
create policy "admin update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "approved read" on public.items;
create policy "approved read" on public.items for select using (public.is_approved());
drop policy if exists "approved insert" on public.items;
create policy "approved insert" on public.items for insert with check (public.is_approved() and kind in ('estimate','event'));
drop policy if exists "admin decide" on public.items;
create policy "admin decide" on public.items for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete" on public.items;
create policy "admin delete" on public.items for delete using (public.is_admin());
-- Agents post requests with the service_role key (server-side only), which bypasses RLS.

-- Live updates between phones
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when others then null; end $$;

-- Starter requests (optional)
insert into public.items(kind,data,status) select 'request','{"from":"Lead runner","text":"New lead: 1234 Example St — yard cleanup. Approve walk?"}','pending'
 where not exists (select 1 from public.items where kind='request');
insert into public.items(kind,data,status) select 'request','{"from":"Bid clerk","text":"Quote ready for Cochiti Rd SE. Send to client?"}','pending'
 where (select count(*) from public.items where kind='request') < 2;
