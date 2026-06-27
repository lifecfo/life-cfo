-- Normalise household-scoped access for money tables used by confirmation actions.

alter table public.categorisation_rules enable row level security;
alter table public.recurring_income enable row level security;
alter table public.categories enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'categorisation_rules'
  loop
    execute format(
      'drop policy if exists %I on public.categorisation_rules',
      policy_record.policyname
    );
  end loop;
end;
$$;

create policy categorisation_rules_select_household_member
  on public.categorisation_rules
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy categorisation_rules_insert_household_editor
  on public.categorisation_rules
  for insert
  to authenticated
  with check (public.is_household_owner_or_editor(household_id));

create policy categorisation_rules_update_household_editor
  on public.categorisation_rules
  for update
  to authenticated
  using (public.is_household_owner_or_editor(household_id))
  with check (public.is_household_owner_or_editor(household_id));

create policy categorisation_rules_delete_household_editor
  on public.categorisation_rules
  for delete
  to authenticated
  using (public.is_household_owner_or_editor(household_id));

drop policy if exists recurring_income_select_own on public.recurring_income;
drop policy if exists recurring_income_insert_own on public.recurring_income;
drop policy if exists recurring_income_update_own on public.recurring_income;
drop policy if exists recurring_income_delete_own on public.recurring_income;
drop policy if exists ri_select_own on public.recurring_income;
drop policy if exists ri_insert_own on public.recurring_income;
drop policy if exists ri_update_own on public.recurring_income;
drop policy if exists ri_delete_own on public.recurring_income;

create policy recurring_income_select_household_member
  on public.recurring_income
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy recurring_income_insert_household_editor
  on public.recurring_income
  for insert
  to authenticated
  with check (
    public.is_household_owner_or_editor(household_id)
    and user_id = auth.uid()
  );

create policy recurring_income_update_household_editor
  on public.recurring_income
  for update
  to authenticated
  using (public.is_household_owner_or_editor(household_id))
  with check (public.is_household_owner_or_editor(household_id));

create policy recurring_income_delete_household_editor
  on public.recurring_income
  for delete
  to authenticated
  using (public.is_household_owner_or_editor(household_id));

drop policy if exists categories_select_own on public.categories;
drop policy if exists categories_insert_own on public.categories;
drop policy if exists categories_update_own on public.categories;
drop policy if exists categories_delete_own on public.categories;

create policy categories_select_household_member
  on public.categories
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy categories_insert_household_editor
  on public.categories
  for insert
  to authenticated
  with check (
    public.is_household_owner_or_editor(household_id)
    and user_id = auth.uid()
  );

create policy categories_update_household_editor
  on public.categories
  for update
  to authenticated
  using (public.is_household_owner_or_editor(household_id))
  with check (public.is_household_owner_or_editor(household_id));

create policy categories_delete_household_editor
  on public.categories
  for delete
  to authenticated
  using (public.is_household_owner_or_editor(household_id));
