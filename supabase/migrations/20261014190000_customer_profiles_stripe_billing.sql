-- Applied 2026-10-14 via Supabase MCP. Stripe subscription columns + guard so customers can't edit billing fields.
alter table public.customer_profiles
  add column if not exists plan_key text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;
create index if not exists customer_profiles_stripe_customer_idx on public.customer_profiles(stripe_customer_id);
create index if not exists customer_profiles_stripe_sub_idx on public.customer_profiles(stripe_subscription_id);

create or replace function public.cprof_protect_billing() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') = 'service_role' or current_user in ('postgres','supabase_admin') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.plan := null; new.plan_key := null; new.stripe_customer_id := null; new.stripe_subscription_id := null;
    new.subscription_status := null; new.current_period_end := null; new.cancel_at_period_end := false;
  else
    new.plan := old.plan; new.plan_key := old.plan_key; new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id; new.subscription_status := old.subscription_status;
    new.current_period_end := old.current_period_end; new.cancel_at_period_end := old.cancel_at_period_end;
  end if;
  return new;
end $$;
drop trigger if exists cprof_protect_billing on public.customer_profiles;
create trigger cprof_protect_billing before insert or update on public.customer_profiles for each row execute function public.cprof_protect_billing();
