-- Owners + per-user permissions. Owners keep role 'admin' (so every existing admin check, policy,
-- push function and client check keeps passing) and get is_owner = true on top.
alter table public.profiles add column if not exists is_owner boolean not null default false;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_permissions_object;
alter table public.profiles add constraint profiles_permissions_object check (jsonb_typeof(permissions) = 'object');
alter table public.profiles drop constraint if exists profiles_owner_is_admin;
alter table public.profiles add constraint profiles_owner_is_admin check (not is_owner or role = 'admin');

create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select is_owner from public.profiles where id = auth.uid()), false) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select public.my_role() = 'admin' or public.is_owner() $$;

-- Guard: owners stay admin; only owners (or the database itself, auth.uid() null) change is_owner / permissions.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_owner then new.role := 'admin'; end if;
  new.access := new.role in ('admin','employee');
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_owner() then new.is_owner := false; new.permissions := '{}'::jsonb; end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.email <> old.email then raise exception 'id/email cannot be changed here'; end if;
    if auth.uid() is not null and not public.is_owner()
       and (new.is_owner is distinct from old.is_owner or new.permissions is distinct from old.permissions) then
      raise exception 'Only owners can change owner status or permissions'; end if;
    if old.is_owner and new.role <> 'admin' then raise exception 'Owners stay admin'; end if;
    if old.email = 'moseley0christian@icloud.com' and (new.role <> 'admin' or not new.is_owner) then raise exception 'The owner account stays owner'; end if;
    if old.is_owner and not new.is_owner and old.id = auth.uid() then raise exception 'You cannot remove your own owner status'; end if;
    if old.role = 'admin' and new.role <> 'admin' and old.id = auth.uid() then raise exception 'You cannot remove your own admin role'; end if;
    if old.role = 'admin' and new.role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then raise exception 'At least one admin is required'; end if;
  end if;
  return new;
end $$;

update public.profiles set is_owner = true, role = 'admin'
 where email in ('moseley0christian@icloud.com', 'nmessina@gatepost.services');
