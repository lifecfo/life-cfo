-- applied manually via SQL Editor on 2026-10-29
--
-- Live-DB RLS audit found two role-enforcement gaps. Neither crosses
-- household boundaries (both require already being a member of the
-- household in question), but both let a "viewer" (read-only) household
-- member write data the app's own UI says only owners/editors can touch.
--
-- 1. household_items and household_reminders each used a single ALL policy
--    gated by is_household_member(household_id) -- any member, including a
--    viewer, could insert/update/delete items and reminders. Viewers should
--    still be able to READ both, so each is split into a read policy
--    (is_household_member) and a separate write policy
--    (is_household_owner_or_editor), rather than tightening the single ALL
--    policy and losing viewer read access.
--
-- 2. household_reminder_reads_own only checked user_id = auth.uid(), with no
--    check that the referenced reminder belongs to a household the caller is
--    actually in. Low impact (the row is only ever visible to the user who
--    wrote it), but still a real gap. Confirmed the FK column via
--    information_schema.columns: household_reminder_reads has
--    (reminder_id uuid not null, user_id uuid not null, seen_at timestamptz
--    not null), and reminder_id references household_reminders.id.

-- 1a. household_items: split read (any member) from write (owner/editor only).
drop policy if exists "household_items_member" on public.household_items;

create policy "household_items_select_member"
  on public.household_items
  for select
  to authenticated
  using (is_household_member(household_id));

create policy "household_items_write_owner_editor"
  on public.household_items
  for insert
  to authenticated
  with check (is_household_owner_or_editor(household_id));

create policy "household_items_update_owner_editor"
  on public.household_items
  for update
  to authenticated
  using (is_household_owner_or_editor(household_id))
  with check (is_household_owner_or_editor(household_id));

create policy "household_items_delete_owner_editor"
  on public.household_items
  for delete
  to authenticated
  using (is_household_owner_or_editor(household_id));

-- 1b. household_reminders: same split.
drop policy if exists "household_reminders_member" on public.household_reminders;

create policy "household_reminders_select_member"
  on public.household_reminders
  for select
  to authenticated
  using (is_household_member(household_id));

create policy "household_reminders_write_owner_editor"
  on public.household_reminders
  for insert
  to authenticated
  with check (is_household_owner_or_editor(household_id));

create policy "household_reminders_update_owner_editor"
  on public.household_reminders
  for update
  to authenticated
  using (is_household_owner_or_editor(household_id))
  with check (is_household_owner_or_editor(household_id));

create policy "household_reminders_delete_owner_editor"
  on public.household_reminders
  for delete
  to authenticated
  using (is_household_owner_or_editor(household_id));

-- 2. household_reminder_reads: also require the reminder to belong to a
-- household the caller is a member of, not just that the row's user_id
-- matches.
drop policy if exists "household_reminder_reads_own" on public.household_reminder_reads;

create policy "household_reminder_reads_own"
  on public.household_reminder_reads
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from household_reminders hr
      join household_members hm on hm.household_id = hr.household_id
      where hr.id = household_reminder_reads.reminder_id
        and hm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from household_reminders hr
      join household_members hm on hm.household_id = hr.household_id
      where hr.id = household_reminder_reads.reminder_id
        and hm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ROLLBACK (not executed by this file -- run manually in the SQL Editor to revert)
-- ---------------------------------------------------------------------------
-- drop policy if exists "household_items_select_member" on public.household_items;
-- drop policy if exists "household_items_write_owner_editor" on public.household_items;
-- drop policy if exists "household_items_update_owner_editor" on public.household_items;
-- drop policy if exists "household_items_delete_owner_editor" on public.household_items;
--
-- create policy "household_items_member"
--   on public.household_items
--   for all
--   to authenticated
--   using (is_household_member(household_id))
--   with check (is_household_member(household_id));
--
-- drop policy if exists "household_reminders_select_member" on public.household_reminders;
-- drop policy if exists "household_reminders_write_owner_editor" on public.household_reminders;
-- drop policy if exists "household_reminders_update_owner_editor" on public.household_reminders;
-- drop policy if exists "household_reminders_delete_owner_editor" on public.household_reminders;
--
-- create policy "household_reminders_member"
--   on public.household_reminders
--   for all
--   to authenticated
--   using (is_household_member(household_id))
--   with check (is_household_member(household_id));
--
-- drop policy if exists "household_reminder_reads_own" on public.household_reminder_reads;
--
-- create policy "household_reminder_reads_own"
--   on public.household_reminder_reads
--   for all
--   to authenticated
--   using (user_id = auth.uid())
--   with check (user_id = auth.uid());
