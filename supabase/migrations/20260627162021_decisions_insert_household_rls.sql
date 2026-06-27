-- Require new decisions to belong to a household the creator can edit.

drop policy if exists decisions_insert on public.decisions;

create policy decisions_insert
  on public.decisions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and household_id is not null
    and public.is_household_owner_or_editor(household_id)
  );
