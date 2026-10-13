-- Outlook-synced events (items.data->>'source' = 'outlook'): notes/location are admin-only.
-- Employees cannot read those rows directly; they get date/time/title through calendar_events_basic().
drop policy if exists "read by role" on public.items;
create policy "read by role" on public.items for select to authenticated
  using (public.is_admin() or (public.is_approved() and kind = 'event' and coalesce(data->>'source','') <> 'outlook'));

-- Non-admins may not create or edit rows that look like Outlook rows.
drop policy if exists "insert by role" on public.items;
create policy "insert by role" on public.items for insert to authenticated
  with check (created_by = public.my_email() and (
    (public.is_admin() and kind in ('estimate','event')) or
    (public.is_approved() and kind = 'event' and coalesce(data->>'source','') <> 'outlook')));
drop policy if exists "employee edit own events" on public.items;
create policy "employee edit own events" on public.items for update to authenticated
  using (public.is_approved() and kind = 'event' and created_by = public.my_email() and coalesce(data->>'source','') <> 'outlook')
  with check (public.is_approved() and kind = 'event' and created_by = public.my_email() and coalesce(data->>'source','') <> 'outlook');

-- Safe columns only, for any approved user.
create or replace function public.calendar_events_basic()
returns table (id bigint, date text, "time" text, start_at text, end_at text, all_day boolean, title text, source text)
language sql stable security definer set search_path = public as $$
  select i.id, i.data->>'date', i.data->>'time', i.data->>'start', i.data->>'end',
         coalesce((i.data->>'allDay')::boolean, false), i.data->>'title', i.data->>'source'
  from public.items i
  where public.is_approved() and i.kind = 'event' and i.data->>'source' = 'outlook'
  order by i.data->>'date', i.data->>'time'
$$;
revoke all on function public.calendar_events_basic() from public, anon;
grant execute on function public.calendar_events_basic() to authenticated;

-- Sync bookkeeping is admin-only too (employees do not need Outlook ids).
drop policy if exists "approved read" on public.calendar_sync;
drop policy if exists "admin read" on public.calendar_sync;
create policy "admin read" on public.calendar_sync for select to authenticated using (public.is_admin());
revoke all on public.calendar_sync from anon;
