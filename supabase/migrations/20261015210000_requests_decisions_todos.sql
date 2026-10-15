-- Requests rework: decisions vs to-dos, needs_christian flag, quiet pushes for routine to-dos.
-- Requests are rows in public.items with kind = 'request' (items.kind is already used for
-- estimate/event/request), so the request type lives in items.req_kind.

alter table public.items
  add column if not exists req_kind text not null default 'todo',
  add column if not exists needs_christian boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_req_kind_check') then
    alter table public.items add constraint items_req_kind_check check (req_kind in ('decision','todo'));
  end if;
end $$;

-- Backfill open requests
update public.items set req_kind = case
    when coalesce(data->>'text','') || ' ' || coalesce(data->>'title','') like '%?%'
      or lower(ltrim(coalesce(nullif(trim(data->>'title'),''), data->>'text', ''))) ~ '^(approve|decide|choose|should|ok to)'
      or lower(ltrim(coalesce(data->>'text',''))) ~ '^(approve|decide|choose|should|ok to)'
    then 'decision' else 'todo' end
where kind = 'request' and coalesce(status,'pending') = 'pending';
update public.items set needs_christian = true where kind = 'request' and req_kind = 'decision';

-- Token RPC: optional kind + needs_christian (backward compatible 4-arg calls still work)
drop function if exists public.post_request(text, text, text, jsonb);
create or replace function public.post_request(p_token text, p_from text, p_text text,
  p_details jsonb default '{}'::jsonb, p_kind text default null, p_needs_christian boolean default null)
returns bigint language plpgsql security definer
set search_path to 'public', 'private', 'extensions'
as $function$
declare v_id bigint; v_hash text; v_kind text; v_nc boolean;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if coalesce(trim(p_from),'') = '' or coalesce(trim(p_text),'') = '' then raise exception 'from and text are required'; end if;
  v_kind := lower(trim(coalesce(nullif(trim(p_kind),''), p_details->>'kind', 'todo')));
  if v_kind not in ('decision','todo') then raise exception 'kind must be decision or todo'; end if;
  v_nc := (v_kind = 'decision') or coalesce(p_needs_christian, (p_details->>'needs_christian')::boolean, false);
  insert into public.items(kind, data, status, created_by, req_kind, needs_christian)
  values ('request', (coalesce(p_details,'{}'::jsonb) - 'kind' - 'needs_christian') || jsonb_build_object('from', left(p_from,80), 'text', left(p_text,2000)),
          'pending', left(p_from,80), v_kind, v_nc)
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.post_request(text, text, text, jsonb, text, boolean) from public;
grant execute on function public.post_request(text, text, text, jsonb, text, boolean) to anon, authenticated;

-- Push only for decisions / needs_christian; schedule branch unchanged
create or replace function public.items_push()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare r record := coalesce(new, old); src text;
begin
  src := coalesce(r.data->>'source','');
  if tg_op = 'INSERT' and r.kind = 'request' and coalesce(r.status,'pending') = 'pending' then
    if r.needs_christian or r.req_kind = 'decision' then
      perform public.push_notify('admin', 'Decision needed: ' || coalesce(r.data->>'from', r.created_by, 'agent'), r.data->>'text', './#requests');
    end if;
  elsif r.kind = 'event' and src <> 'outlook' and coalesce(r.created_by,'') <> 'outlook-sync' then
    if tg_op = 'UPDATE' and new.data is not distinct from old.data then return null; end if;
    perform public.push_notify('team',
      case tg_op when 'INSERT' then 'New on the schedule' when 'UPDATE' then 'Schedule changed' else 'Removed from schedule' end,
      concat_ws(' · ', r.data->>'title', r.data->>'date', r.data->>'time'), './#calendar');
  end if;
  return null;
end $function$;
revoke execute on function public.items_push() from public, anon, authenticated;
