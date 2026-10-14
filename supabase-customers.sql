-- Gatepost customer side, phase 1. Run after supabase-roles.sql (safe to re-run).
-- Adds a 'customer' role (own data only), customer "Something broke" requests, and a private photo bucket.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','employee','pending','customer'));

-- New signups: first account ever = admin; sign-ups from the customer screen = customer; everyone else = pending.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  perform pg_advisory_xact_lock(42);
  select not exists(select 1 from public.profiles) into first;
  insert into public.profiles(id,email,role,access)
  values (new.id, lower(new.email),
    case when first then 'admin'
         when coalesce(new.raw_user_meta_data->>'signup_as','') = 'customer' then 'customer'
         else 'pending' end, first);
  return new;
end $$;

create or replace function public.is_customer() returns boolean language sql stable security definer set search_path = public as
$$ select public.my_role() = 'customer' $$;

create table if not exists public.customer_requests (
  id bigint generated always as identity primary key,
  customer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_email text,
  description text not null check (length(description) between 1 and 4000),
  address text not null check (length(address) between 1 and 500),
  photos text[] not null default '{}' check (coalesce(array_length(photos,1),0) <= 5),
  status text not null default 'new' check (status in ('new','reviewing','scheduled','done','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists customer_requests_customer_idx on public.customer_requests(customer_id, created_at desc);
alter table public.customer_requests enable row level security;

create or replace function public.customer_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.customer_email := public.my_email(); new.status := 'new'; new.created_at := now();
  else
    if new.customer_id <> old.customer_id then raise exception 'customer cannot be changed'; end if;
    new.updated_by := public.my_email();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists customer_requests_guard on public.customer_requests;
create trigger customer_requests_guard before insert or update on public.customer_requests for each row execute function public.customer_requests_guard();

drop policy if exists "cr read own or admin" on public.customer_requests;
create policy "cr read own or admin" on public.customer_requests for select to authenticated
  using (public.is_admin() or (customer_id = (select auth.uid()) and public.is_customer()));
drop policy if exists "cr customer insert" on public.customer_requests;
create policy "cr customer insert" on public.customer_requests for insert to authenticated
  with check (customer_id = (select auth.uid()) and public.is_customer());
drop policy if exists "cr admin update" on public.customer_requests;
create policy "cr admin update" on public.customer_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cr admin delete" on public.customer_requests;
create policy "cr admin delete" on public.customer_requests for delete to authenticated using (public.is_admin());

-- Photos: private bucket, path <customer uid>/<file>. Max 10 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-photos','customer-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "cp read own or admin" on storage.objects;
create policy "cp read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'customer-photos' and (public.is_admin() or (public.is_customer() and (storage.foldername(name))[1] = (select auth.uid())::text)));
drop policy if exists "cp customer upload" on storage.objects;
create policy "cp customer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-photos' and public.is_customer() and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cp admin delete" on storage.objects;
create policy "cp admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-photos' and public.is_admin());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='customer_requests') then
    alter publication supabase_realtime add table public.customer_requests; end if; end $$;

-- Advisor hardening for the new functions: the trigger fn is never called directly; is_customer needs a signed-in user.
revoke execute on function public.customer_requests_guard() from public, anon, authenticated;
revoke execute on function public.is_customer() from public, anon;
