-- Price book sync (2026-10-20). Additive columns + token RPC that replaces all rows.
alter table public.price_book add column if not exists section text, add column if not exists low numeric, add column if not exists aim numeric, add column if not exists sort int;
create or replace function public.price_book_replace(p_token text, p_rows jsonb) returns integer language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare n integer;
begin
  perform private.unfinished_check_token(p_token);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'rows must be a non-empty array'; end if;
  delete from public.price_book where true;
  insert into public.price_book(section, service, unit, low, aim, rate, notes, source, sort, updated_at)
  select left(r->>'section',200), left(r->>'service',300), left(r->>'unit',60), nullif(r->>'low','')::numeric, nullif(r->>'aim','')::numeric, nullif(r->>'aim','')::numeric,
         left(r->>'notes',2000), left(r->>'source',300), (ord)::int, now()
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord) where coalesce(trim(r->>'service'),'') <> '';
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.price_book_replace(text,jsonb) from public; grant execute on function public.price_book_replace(text,jsonb) to anon, authenticated;
