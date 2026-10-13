-- Bots mark a request decided/cleared: resolve_request(token, item_id, status, note).
-- status: 'approved' | 'declined' (stored as 'denied', same as the app) | 'done'. Note is optional.
-- The note is added to the request's notes, decided_by = '<bot> (bot)', and the clear is logged in bot_activity.
create or replace function public.resolve_request(p_token text, p_item_id bigint, p_status text, p_note text default null)
returns text language plpgsql security definer set search_path = public, private, extensions as $$
declare v_hash text; v_row public.items; v_status text; v_bot text; v_title text;
begin
  select value into v_hash from private.settings where key = 'request_token_sha256';
  if v_hash is null or encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  v_status := case lower(trim(coalesce(p_status,''))) when 'approved' then 'approved' when 'approve' then 'approved'
    when 'declined' then 'denied' when 'decline' then 'denied' when 'denied' then 'denied' when 'done' then 'done' else null end;
  if v_status is null then raise exception 'status must be approved, declined or done'; end if;
  select * into v_row from public.items where id = p_item_id and kind = 'request' for update;
  if not found then raise exception 'request % not found', p_item_id; end if;
  v_bot := coalesce(v_row.data->>'from', 'bot');
  v_title := coalesce(nullif(trim(v_row.data->>'title'),''), left(v_row.data->>'text', 80));
  update public.items set status = v_status, decided_by = v_bot || ' (bot)', decided_at = now(),
    data = case when coalesce(trim(p_note),'') = '' then data
      else jsonb_set(data, '{notes}', coalesce(data->'notes','[]'::jsonb) || jsonb_build_array(jsonb_build_object('text', left(p_note,2000), 'by', v_bot || ' (bot)', 'at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')))) end
  where id = p_item_id;
  if v_bot in ('Gatepost','Gatepost Leads','Gatepost Bids','Gatepost Tasks','Gatepost App') then
    insert into public.bot_activity(bot, body, done) values (v_bot,
      (case v_status when 'approved' then 'Marked approved: ' when 'denied' then 'Marked declined: ' else 'Cleared (done): ' end) || v_title
      || case when coalesce(trim(p_note),'') = '' then '' else ' (' || left(p_note, 300) || ')' end, false);
  end if;
  return v_status;
end $$;
revoke all on function public.resolve_request(text,bigint,text,text) from public;
grant execute on function public.resolve_request(text,bigint,text,text) to anon, authenticated;
