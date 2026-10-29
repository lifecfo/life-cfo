-- applied manually via SQL Editor on 2026-10-29
--
-- Third part of finding #3 from the live-DB RLS audit (household_items and
-- household_reminders were fixed in 20261029120001). money_goals,
-- money_goal_accounts, and money_goal_updates have the same gap: their
-- insert/update/delete policies are gated by is_household_member(household_id)
-- instead of is_household_owner_or_editor(household_id), so a "viewer"
-- (read-only) household member can create/edit/delete goals. Not a
-- cross-household leak -- requires already being a member of that household.
--
-- Select policies are left untouched (viewers should still read goals).
-- money_goal_updates_household_update_blocked is left untouched too -- its
-- qual/with_check are already `false`, so updates are blocked for everyone
-- regardless of role.
--
-- Policy names below are the real names from pg_policies (public schema),
-- confirmed via the live-DB audit's pg_policies dump.

-- money_goals
drop policy if exists "money_goals_household_insert" on public.money_goals;

create policy "money_goals_household_insert"
  on public.money_goals
  for insert
  to public
  with check (is_household_owner_or_editor(household_id));

drop policy if exists "money_goals_household_update" on public.money_goals;

create policy "money_goals_household_update"
  on public.money_goals
  for update
  to public
  using (is_household_owner_or_editor(household_id))
  with check (is_household_owner_or_editor(household_id));

drop policy if exists "money_goals_household_delete" on public.money_goals;

create policy "money_goals_household_delete"
  on public.money_goals
  for delete
  to public
  using (is_household_owner_or_editor(household_id));

-- money_goal_accounts
drop policy if exists "money_goal_accounts_household_insert" on public.money_goal_accounts;

create policy "money_goal_accounts_household_insert"
  on public.money_goal_accounts
  for insert
  to public
  with check (is_household_owner_or_editor(household_id));

drop policy if exists "money_goal_accounts_household_update" on public.money_goal_accounts;

create policy "money_goal_accounts_household_update"
  on public.money_goal_accounts
  for update
  to public
  using (is_household_owner_or_editor(household_id))
  with check (is_household_owner_or_editor(household_id));

drop policy if exists "money_goal_accounts_household_delete" on public.money_goal_accounts;

create policy "money_goal_accounts_household_delete"
  on public.money_goal_accounts
  for delete
  to public
  using (is_household_owner_or_editor(household_id));

-- money_goal_updates (insert/delete only -- update is already blocked for everyone)
drop policy if exists "money_goal_updates_household_insert" on public.money_goal_updates;

create policy "money_goal_updates_household_insert"
  on public.money_goal_updates
  for insert
  to public
  with check (is_household_owner_or_editor(household_id));

drop policy if exists "money_goal_updates_household_delete" on public.money_goal_updates;

create policy "money_goal_updates_household_delete"
  on public.money_goal_updates
  for delete
  to public
  using (is_household_owner_or_editor(household_id));

-- ---------------------------------------------------------------------------
-- ROLLBACK (not executed by this file -- run manually in the SQL Editor to revert)
-- ---------------------------------------------------------------------------
-- drop policy if exists "money_goals_household_insert" on public.money_goals;
-- create policy "money_goals_household_insert" on public.money_goals
--   for insert to public with check (is_household_member(household_id));
--
-- drop policy if exists "money_goals_household_update" on public.money_goals;
-- create policy "money_goals_household_update" on public.money_goals
--   for update to public
--   using (is_household_member(household_id))
--   with check (is_household_member(household_id));
--
-- drop policy if exists "money_goals_household_delete" on public.money_goals;
-- create policy "money_goals_household_delete" on public.money_goals
--   for delete to public using (is_household_member(household_id));
--
-- drop policy if exists "money_goal_accounts_household_insert" on public.money_goal_accounts;
-- create policy "money_goal_accounts_household_insert" on public.money_goal_accounts
--   for insert to public with check (is_household_member(household_id));
--
-- drop policy if exists "money_goal_accounts_household_update" on public.money_goal_accounts;
-- create policy "money_goal_accounts_household_update" on public.money_goal_accounts
--   for update to public
--   using (is_household_member(household_id))
--   with check (is_household_member(household_id));
--
-- drop policy if exists "money_goal_accounts_household_delete" on public.money_goal_accounts;
-- create policy "money_goal_accounts_household_delete" on public.money_goal_accounts
--   for delete to public using (is_household_member(household_id));
--
-- drop policy if exists "money_goal_updates_household_insert" on public.money_goal_updates;
-- create policy "money_goal_updates_household_insert" on public.money_goal_updates
--   for insert to public with check (is_household_member(household_id));
--
-- drop policy if exists "money_goal_updates_household_delete" on public.money_goal_updates;
-- create policy "money_goal_updates_household_delete" on public.money_goal_updates
--   for delete to public using (is_household_member(household_id));
