-- Gatepost Home (customer app) phase 1, part 2. Run after supabase-customers.sql (safe to re-run).
-- Request types/priority/due date, customer profile details, maintenance visits, contracts.

-- 1) customer_requests: type, priority, due_at. Address optional for add-on / cancel requests.
alter table public.customer_requests add column if not exists type text not null default 'repair';
alter table public.customer_requests add column if not exists priority text not null default 'normal';
alter table public.customer_requests add column if not exists due_at timestamptz;
alter table public.customer_requests add column if not exists stripe_ref text; -- hook: Stripe subscription/checkout id (not used yet)
alter table public.customer_requests drop constraint if exists customer_requests_type_check;
alter table public.customer_requests add constraint customer_requests_type_check check (type in ('repair','urgent','addon','cancel'));
alter table public.customer_requests drop constraint if exists customer_requests_priority_check;
alter table public.customer_requests add constraint customer_requests_priority_check check (priority in ('normal','urgent'));
alter table public.customer_requests drop constraint if exists customer_requests_address_check;
alter table public.customer_requests add constraint customer_requests_address_check check (length(address) <= 500);

-- Server decides priority/due date: urgent = due 24h after submission. Admins may adjust later.
create or replace function public.customer_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.customer_email := public.my_email(); new.status := 'new'; new.created_at := now(); new.stripe_ref := null;
    if new.type = 'urgent' then new.priority := 'urgent'; new.due_at := now() + interval '24 hours';
    else new.priority := 'normal'; new.due_at := null; end if;
  else
    if new.customer_id <> old.customer_id then raise exception 'customer cannot be changed'; end if;
    new.updated_by := public.my_email();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.customer_requests_guard() from public, anon, authenticated;

-- 2) Customer profile details (name, phone, address). One row per customer.
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (length(full_name) <= 200),
  phone text check (length(phone) <= 40),
  address text check (length(address) <= 500),
  plan text,                -- placeholder until plans are final (null = not selected)
  stripe_customer_id text,  -- hook for Stripe later; set server-side only
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;
drop policy if exists "cprof read own or admin" on public.customer_profiles;
create policy "cprof read own or admin" on public.customer_profiles for select to authenticated
  using (public.is_admin() or (id = (select auth.uid()) and public.is_customer()));
drop policy if exists "cprof insert own" on public.customer_profiles;
create policy "cprof insert own" on public.customer_profiles for insert to authenticated
  with check (id = (select auth.uid()) and public.is_customer() and plan is null and stripe_customer_id is null);
drop policy if exists "cprof update own or admin" on public.customer_profiles;
create policy "cprof update own or admin" on public.customer_profiles for update to authenticated
  using (public.is_admin() or (id = (select auth.uid()) and public.is_customer()))
  with check (public.is_admin() or (id = (select auth.uid()) and public.is_customer()));
-- Customers cannot change their own plan / Stripe id.
create or replace function public.customer_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'UPDATE' then new.plan := old.plan; new.stripe_customer_id := old.stripe_customer_id;
    else new.plan := null; new.stripe_customer_id := null; end if;
  end if;
  new.updated_at := now(); return new;
end $$;
revoke execute on function public.customer_profiles_guard() from public, anon, authenticated;
drop trigger if exists customer_profiles_guard on public.customer_profiles;
create trigger customer_profiles_guard before insert or update on public.customer_profiles for each row execute function public.customer_profiles_guard();

-- 3) Maintenance visits. Admins create/edit; customers read their own.
create table if not exists public.customer_visits (
  id bigint generated always as identity primary key,
  customer_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (length(type) between 1 and 120),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','done','canceled')),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists customer_visits_customer_idx on public.customer_visits(customer_id, scheduled_for);
alter table public.customer_visits enable row level security;
drop policy if exists "cv read own or admin" on public.customer_visits;
create policy "cv read own or admin" on public.customer_visits for select to authenticated
  using (public.is_admin() or (customer_id = (select auth.uid()) and public.is_customer()));
drop policy if exists "cv admin insert" on public.customer_visits;
create policy "cv admin insert" on public.customer_visits for insert to authenticated with check (public.is_admin());
drop policy if exists "cv admin update" on public.customer_visits;
create policy "cv admin update" on public.customer_visits for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cv admin delete" on public.customer_visits;
create policy "cv admin delete" on public.customer_visits for delete to authenticated using (public.is_admin());

-- 4) Contracts. Customers read their own and sign only through sign_customer_contract().
create table if not exists public.customer_contracts (
  id bigint generated always as identity primary key,
  customer_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  pdf_path text,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists customer_contracts_customer_idx on public.customer_contracts(customer_id);
alter table public.customer_contracts enable row level security;
drop policy if exists "cc read own or admin" on public.customer_contracts;
create policy "cc read own or admin" on public.customer_contracts for select to authenticated
  using (public.is_admin() or (customer_id = (select auth.uid()) and public.is_customer()));
drop policy if exists "cc admin write" on public.customer_contracts;
create policy "cc admin write" on public.customer_contracts for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.sign_customer_contract(p_id bigint, p_name text, p_user_agent text)
returns public.customer_contracts language plpgsql security definer set search_path = public as $$
declare r public.customer_contracts; hdr json; ip text;
begin
  if not public.is_customer() then raise exception 'customers only'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Please type your full name'; end if;
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  ip := split_part(coalesce(hdr->>'x-forwarded-for', hdr->>'x-real-ip', ''), ',', 1);
  update public.customer_contracts set signed_name = left(trim(p_name), 200), signed_at = now(),
    signed_ip = nullif(trim(ip), ''), signed_user_agent = left(p_user_agent, 500)
  where id = p_id and customer_id = auth.uid() and signed_at is null returning * into r;
  if r.id is null then raise exception 'Contract not found or already signed'; end if;
  return r;
end $$;
revoke execute on function public.sign_customer_contract(bigint, text, text) from public, anon;
grant execute on function public.sign_customer_contract(bigint, text, text) to authenticated;

-- 5) New customer sign-ups get a profile row and a DRAFT service agreement to review.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean; is_cust boolean;
begin
  perform pg_advisory_xact_lock(42);
  select not exists(select 1 from public.profiles) into first;
  is_cust := not first and coalesce(new.raw_user_meta_data->>'signup_as','') = 'customer';
  insert into public.profiles(id,email,role,access)
  values (new.id, lower(new.email), case when first then 'admin' when is_cust then 'customer' else 'pending' end, first);
  if is_cust then
    insert into public.customer_profiles(id, full_name, phone)
    values (new.id, left(new.raw_user_meta_data->>'full_name', 200), left(new.raw_user_meta_data->>'phone', 40))
    on conflict (id) do nothing;
    insert into public.customer_contracts(customer_id, title, body) values (new.id, 'Home Care Service Agreement (DRAFT — not final)',
'DRAFT — NOT FINAL. These are placeholder terms for review only. Final terms will replace this text before any plan starts.

1. Parties. This agreement is between you (the "Customer") and Gatepost Property Services ("Gatepost").
2. Services. Gatepost will perform the property care services in the plan you select, plus any add-ons you request and approve.
3. Scheduling. Visits are scheduled in the app. We aim to respond to urgent requests within 24 hours; timing depends on availability, access and conditions.
4. Access. You agree to provide safe access to the areas to be serviced, and to tell us about gate codes, pets and hazards.
5. Pricing and billing. Plan pricing is not final. No charges apply under this draft.
6. Cancellation. You may request cancellation at any time from Settings in the app.
7. Contact. Questions: (505) 750-3019.');
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_customer() from public, anon;

-- 6) Live sync for the new tables.
do $$ declare t text; begin
  foreach t in array array['customer_profiles','customer_visits','customer_contracts'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t); end if;
  end loop; end $$;
