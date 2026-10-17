-- Quotes tab: saved customer quotes (admin only) + private storage bucket "quotes".
create sequence if not exists public.quotes_seq;
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('GPS-' || to_char(now() at time zone 'America/Denver', 'YYYY') || '-' || lpad(nextval('public.quotes_seq')::text, 4, '0')),
  service text not null,
  customer jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  total numeric(12,2) not null default 0,
  has_pending boolean not null default false,
  pending_override boolean not null default false,
  pdf_path text, json_path text,
  texted_at timestamptz, texted_to text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
revoke all on public.quotes from anon;
grant select, insert, update, delete on public.quotes to authenticated;
grant usage on sequence public.quotes_seq to authenticated;
drop policy if exists "quotes admin all" on public.quotes;
create policy "quotes admin all" on public.quotes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists quotes_created_at_idx on public.quotes (created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotes', 'quotes', false, 10485760, array['application/pdf', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "quotes bucket admin select" on storage.objects;
create policy "quotes bucket admin select" on storage.objects for select to authenticated using (bucket_id = 'quotes' and public.is_admin());
drop policy if exists "quotes bucket admin insert" on storage.objects;
create policy "quotes bucket admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'quotes' and public.is_admin());
drop policy if exists "quotes bucket admin update" on storage.objects;
create policy "quotes bucket admin update" on storage.objects for update to authenticated using (bucket_id = 'quotes' and public.is_admin()) with check (bucket_id = 'quotes' and public.is_admin());
drop policy if exists "quotes bucket admin delete" on storage.objects;
create policy "quotes bucket admin delete" on storage.objects for delete to authenticated using (bucket_id = 'quotes' and public.is_admin());
