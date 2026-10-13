-- Gatepost roles: admin / employee / pending. Run after supabase-setup.sql (safe to re-run).
-- admin: everything. employee: calendar/events + own profile only. pending: nothing until an admin approves.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'pending' where role = 'employee' and access = false;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','employee','pending'));
alter table public.profiles alter column role set default 'pending';

-- New signups: first account ever = admin, everyone else = pending.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  perform pg_advisory_xact_lock(42);
  select not exists(select 1 from public.profiles) into first;
  insert into public.profiles(id,email,role,access)
  values (new.id, lower(new.email), case when first then 'admin' else 'pending' end, first);
  return new;
end $$;

-- Keep legacy "access" column in sync with role; protect the owner and the last admin.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.access := new.role in ('admin','employee');
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.email <> old.email then raise exception 'id/email cannot be changed here'; end if;
    if old.email = 'moseley0christian@icloud.com' and new.role <> 'admin' then raise exception 'The owner account stays admin'; end if;
    if old.role = 'admin' and new.role <> 'admin' and old.id = auth.uid() then raise exception 'You cannot remove your own admin role'; end if;
    if old.role = 'admin' and new.role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then raise exception 'At least one admin is required'; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles for each row execute function public.profiles_guard();
update public.profiles set role = 'admin' where email = 'moseley0christian@icloud.com';

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select coalesce((select role from public.profiles where id = auth.uid()), 'pending') $$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path = public as
$$ select public.my_role() in ('admin','employee') $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select public.my_role() = 'admin' $$;
create or replace function public.my_email() returns text language sql stable security definer set search_path = public as
$$ select email from public.profiles where id = auth.uid() $$;

-- profiles: read own (or all if admin); only admins change roles.
drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "admin update" on public.profiles;
create policy "admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- items: requests + estimates (pricing) are admin-only; events are shared with employees.
drop policy if exists "approved read" on public.items;
drop policy if exists "read by role" on public.items;
create policy "read by role" on public.items for select to authenticated
  using (public.is_admin() or (public.is_approved() and kind = 'event'));
drop policy if exists "approved insert" on public.items;
drop policy if exists "insert by role" on public.items;
create policy "insert by role" on public.items for insert to authenticated
  with check (created_by = public.my_email() and ((public.is_admin() and kind in ('estimate','event')) or (public.is_approved() and kind = 'event')));
drop policy if exists "admin decide" on public.items;
create policy "admin decide" on public.items for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "employee edit own events" on public.items;
create policy "employee edit own events" on public.items for update to authenticated
  using (public.is_approved() and kind = 'event' and created_by = public.my_email())
  with check (public.is_approved() and kind = 'event' and created_by = public.my_email());
drop policy if exists "admin delete" on public.items;
create policy "admin delete" on public.items for delete to authenticated using (public.is_admin());
select email, role, access from public.profiles;
