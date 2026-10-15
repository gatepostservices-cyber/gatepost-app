-- Optimization pass (applied 2026-10-14 via Supabase MCP as "optimization_pass_grants_and_rls").
-- Trigger functions never need to be callable over the API.
revoke execute on function public.profiles_guard(), public.cprof_protect_billing(), public.items_push(), public.bot_messages_push() from public, anon, authenticated;
-- Role helpers / signed-in RPCs: signed-in only (all policies are TO authenticated).
revoke execute on function public.is_admin(), public.is_approved(), public.my_email(), public.my_role() from public, anon;
grant execute on function public.is_admin(), public.is_approved(), public.my_email(), public.my_role() to authenticated;
revoke execute on function public.approve_board_item(text, text, text, jsonb) from public, anon;
-- calendar_sync: one admin policy, signed-in role only.
drop policy if exists "admin read" on public.calendar_sync;
drop policy if exists "admin write" on public.calendar_sync;
create policy "admin all" on public.calendar_sync for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- customer_contracts: split ALL so SELECT has a single policy.
drop policy if exists "cc admin write" on public.customer_contracts;
create policy "cc admin insert" on public.customer_contracts for insert to authenticated with check (public.is_admin());
create policy "cc admin update" on public.customer_contracts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cc admin delete" on public.customer_contracts for delete to authenticated using (public.is_admin());
-- items UPDATE: merge the two permissive policies (same semantics).
drop policy if exists "admin decide" on public.items;
drop policy if exists "employee edit own events" on public.items;
create policy "update by role" on public.items for update to authenticated
  using (public.is_admin() or (public.is_approved() and kind = 'event' and created_by = public.my_email() and coalesce(data->>'source','') <> 'outlook'))
  with check (public.is_admin() or (public.is_approved() and kind = 'event' and created_by = public.my_email() and coalesce(data->>'source','') <> 'outlook'));
-- auth.uid() evaluated once per query.
alter policy "own or admin read" on public.profiles using ((id = (select auth.uid())) or public.is_admin());
alter policy "own subs select" on public.push_subscriptions using (user_id = (select auth.uid()));
alter policy "own subs insert" on public.push_subscriptions with check (user_id = (select auth.uid()));
alter policy "own subs update" on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own subs delete" on public.push_subscriptions using (user_id = (select auth.uid()));
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
