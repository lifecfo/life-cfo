-- Security hardening for the hosted Keystone database (Supabase advisors, 2026-10-23).
-- Safe for the live main-branch app: no table, column or policy changes.

-- 1) Views -------------------------------------------------------------------
-- home_status_latest exposed every user's home status to anyone (incl. signed-out)
-- because it ran with the owner's rights. The app only reads it with the service
-- role, so run it with the caller's rights and RLS on home_status_runs applies.
alter view public.home_status_latest set (security_invoker = true);
revoke all on public.home_status_latest from anon;
revoke insert, update, delete, truncate, references, trigger on public.home_status_latest from authenticated;

-- accounts_balance_only_view intentionally shows other household members'
-- balance-only accounts (limited columns), which RLS on accounts would hide, so it
-- stays owner-rights. It is auto-updatable, so remove every write privilege
-- (members could otherwise edit each other's accounts through it) and signed-out access.
revoke all on public.accounts_balance_only_view from anon;
revoke insert, update, delete, truncate, references, trigger on public.accounts_balance_only_view from authenticated;

-- 2) SECURITY DEFINER functions ---------------------------------------------
-- Called by the app as a signed-in user (or used in RLS policies TO authenticated):
-- signed-in only.
revoke execute on function public.append_decision_review(uuid, text, text, integer) from public, anon;
revoke execute on function public.can_edit_decision(uuid) from public, anon;
revoke execute on function public.can_view_decision(uuid) from public, anon;
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.keystone_delete_my_data() from public, anon;
revoke execute on function public.list_decision_shares(uuid) from public, anon;
revoke execute on function public.share_decision_to_household(uuid, uuid, text, text) from public, anon;
revoke execute on function public.unshare_decision(uuid) from public, anon;
revoke execute on function public.unshare_decision_from_household(uuid, uuid) from public, anon;
revoke execute on function public.update_decision_share_permission(uuid, uuid, text) from public, anon;
grant execute on function public.append_decision_review(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.can_edit_decision(uuid) to authenticated, service_role;
grant execute on function public.can_view_decision(uuid) to authenticated, service_role;
grant execute on function public.create_household(text) to authenticated, service_role;
grant execute on function public.keystone_delete_my_data() to authenticated, service_role;
grant execute on function public.list_decision_shares(uuid) to authenticated, service_role;
grant execute on function public.share_decision_to_household(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.unshare_decision(uuid) to authenticated, service_role;
grant execute on function public.unshare_decision_from_household(uuid, uuid) to authenticated, service_role;
grant execute on function public.update_decision_share_permission(uuid, uuid, text) to authenticated, service_role;

-- Maintenance / demo functions with NO caller check and not used by the app:
-- service role only. (seed_demo_money let anyone insert accounts/transactions into
-- any household; keystone_bulk_mark_reviewed let anyone edit any decision.)
revoke execute on function public.seed_demo_money(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.keystone_backfill_review_at(boolean) from public, anon, authenticated;
revoke execute on function public.keystone_backfill_review_at(integer) from public, anon, authenticated;
revoke execute on function public.keystone_bulk_mark_reviewed(uuid[]) from public, anon, authenticated;
grant execute on function public.seed_demo_money(uuid, uuid) to service_role;
grant execute on function public.keystone_backfill_review_at(boolean) to service_role;
grant execute on function public.keystone_backfill_review_at(integer) to service_role;
grant execute on function public.keystone_bulk_mark_reviewed(uuid[]) to service_role;

-- is_household_member / is_household_owner_or_editor deliberately keep anon execute:
-- about 30 existing RLS policies are TO public and call them, so revoking would make
-- signed-out queries on those tables error. Both only return booleans for auth.uid(),
-- which is false when signed out.

-- 3) Pin search_path on functions that had none -------------------------------
alter function public.keystone_review_days(text) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.keystone_set_default_review_at() set search_path = public, pg_temp;
alter function public.keystone_next_review_at(jsonb, timestamptz) set search_path = public, pg_temp;
alter function public.keystone_set_review_at_on_insert() set search_path = public, pg_temp;
alter function public.decision_child_set_household_id() set search_path = public, pg_temp;
alter function public.decision_link_set_household_id() set search_path = public, pg_temp;
alter function public.keystone_backfill_review_at(boolean) set search_path = public, pg_temp;
alter function public.keystone_backfill_review_at(integer) set search_path = public, pg_temp;
alter function public.keystone_bulk_mark_reviewed(uuid[]) set search_path = public, pg_temp;
alter function public.block_crisis_captures() set search_path = public, pg_temp;
alter function public.recompute_money_goal_current() set search_path = public, pg_temp;
