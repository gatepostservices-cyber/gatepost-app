-- Read-only list of open Unfinished items for bots (same posting token). Optional agent filter.
create or replace function public.unfinished_list(p_token text, p_agent_id text default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, extensions as $$
declare out jsonb;
begin
  perform private.unfinished_check_token(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('ext_key', ext_key, 'agent_id', agent_id, 'bot', bot_name, 'summary', summary, 'state', state, 'updated_at', updated_at) order by updated_at), '[]'::jsonb)
    into out from public.unfinished
   where status = 'open' and (coalesce(trim(p_agent_id),'') = '' or agent_id = trim(p_agent_id));
  return out;
end $$;
revoke all on function public.unfinished_list(text,text) from public;
grant execute on function public.unfinished_list(text,text) to anon, authenticated;
