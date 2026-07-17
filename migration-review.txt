-- Account visibility -- accounts/transactions RLS rewrite, ownership-column
-- protection trigger, and a safe balance-only projection view.
-- See the "Account visibility -- final design (v2)" spec discussed this
-- session (rules A-I). NOTE: that doc has not actually been saved to
-- docs/product/ yet as of this migration -- drafted directly from the
-- full spec text, not from a file on disk. Flagged, not assumed.
--
-- Two deliberate deviations from the literal instruction set this
-- migration was drafted against, both flagged here for explicit review
-- -- see the accompanying plain-English walkthrough, not just this
-- comment, before this is applied:
--
-- 1. accounts' SELECT policy below only treats 'shared' (not also
--    'balance_only') as visible-to-others in the BASE TABLE's own row
--    policy. RLS is row-level only -- it cannot also restrict which
--    COLUMNS a visible row exposes. Including 'balance_only' rows in
--    the base table's own policy would let a non-owner `select *` and
--    see every column (provider_account_id, connection_id, mask,
--    official_name, etc), directly contradicting rule D's exact-field
--    allowlist. Balance-only access is instead served exclusively
--    through the safe projection view at the bottom of this file --
--    the only place rule D's column limit can actually be enforced.
--
-- 2. accounts' INSERT policy is left untouched -- not named in the
--    instruction set this migration was originally drafted against.
--    DELETE was originally left untouched for the same reason, but has
--    since been rewritten below (section 5) to close exactly the gap
--    this comment used to flag: a household Owner/Editor could
--    otherwise still delete another member's Private or Balance-only
--    account outright.

-- 1) Visibility column. Three-value CHECK; defaults to 'shared', which
--    matches today's implicit behaviour for every existing row (nothing
--    changes for anyone until an owner deliberately changes their own
--    account's tier).
alter table public.accounts
  add column visibility text not null default 'shared'
    check (visibility in ('shared', 'balance_only', 'private'));

-- 2) Ownership-column protection trigger (rule E/F). The UPDATE policy
--    below decides whether an UPDATE is allowed on a row at all; RLS
--    has no mechanism to allow an UPDATE on some columns of a row but
--    not others, so protecting visibility/user_id/household_id
--    specifically has to be a trigger, not a policy. Applies
--    universally regardless of role -- including service-role
--    connections, which have no auth.uid() and would therefore always
--    fail this check if they ever tried to touch these three columns.
create or replace function public.accounts_protect_ownership_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (
    new.visibility is distinct from old.visibility
    or new.user_id is distinct from old.user_id
    or new.household_id is distinct from old.household_id
  ) and old.user_id is distinct from auth.uid() then
    raise exception
      'Only this account''s current owner can change its visibility, ownership, or household assignment.';
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_protect_ownership_columns_trigger on public.accounts;

create trigger accounts_protect_ownership_columns_trigger
  before update on public.accounts
  for each row
  execute function public.accounts_protect_ownership_columns();

-- 3) Accounts SELECT -- owner always; other household members only for
--    'shared' rows (see deviation #1 above for why 'balance_only' isn't
--    included here).
drop policy if exists accounts_select_household on public.accounts;

create policy accounts_select_household
  on public.accounts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      visibility = 'shared'
      and public.is_household_member(household_id)
    )
  );

-- 4) Accounts UPDATE -- the account's own owner can always update it
--    (rename, etc), regardless of visibility or their household role.
--    A non-owner household Owner/Editor can only update it when the
--    account is fully Shared -- per rule G, seeing a balance is not the
--    same permission as controlling the account.
drop policy if exists accounts_update_owner_editor on public.accounts;

create policy accounts_update_owner_editor
  on public.accounts
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_household_owner_or_editor(household_id)
      and visibility = 'shared'
    )
  )
  with check (
    user_id = auth.uid()
    or (
      public.is_household_owner_or_editor(household_id)
      and visibility = 'shared'
    )
  );

-- 5) Accounts DELETE -- same owner-or-shared-and-role logic as UPDATE
--    (section 4). The account's own owner can always delete it; a
--    non-owner household Owner/Editor can only delete it when it's
--    fully Shared. This replaces the previous unconditional
--    is_household_owner_or_editor(household_id)-only policy, which
--    would otherwise still let a household Owner/Editor delete another
--    member's Private or Balance-only account outright.
drop policy if exists accounts_delete_owner_editor on public.accounts;

create policy accounts_delete_owner_editor
  on public.accounts
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_household_owner_or_editor(household_id)
      and visibility = 'shared'
    )
  );

-- 6) Transactions -- every policy now checks the LINKED ACCOUNT's
--    visibility and household (via account_id), not the transaction's
--    own household_id column directly. The linked account's owner
--    always has access; other household members only when the account
--    is fully Shared (never balance_only -- rule C).

drop policy if exists transactions_select_household_member on public.transactions;

create policy transactions_select_household_member
  on public.transactions
  for select
  to public
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and (
          a.user_id = auth.uid()
          or (a.visibility = 'shared' and public.is_household_member(a.household_id))
        )
    )
  );

drop policy if exists transactions_insert_owner_editor on public.transactions;

create policy transactions_insert_owner_editor
  on public.transactions
  for insert
  to public
  with check (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and (
          a.user_id = auth.uid()
          or (a.visibility = 'shared' and public.is_household_owner_or_editor(a.household_id))
        )
    )
  );

drop policy if exists transactions_update_owner_editor on public.transactions;

create policy transactions_update_owner_editor
  on public.transactions
  for update
  to public
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and (
          a.user_id = auth.uid()
          or (a.visibility = 'shared' and public.is_household_owner_or_editor(a.household_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and (
          a.user_id = auth.uid()
          or (a.visibility = 'shared' and public.is_household_owner_or_editor(a.household_id))
        )
    )
  );

drop policy if exists transactions_delete_owner_editor on public.transactions;

create policy transactions_delete_owner_editor
  on public.transactions
  for delete
  to public
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and (
          a.user_id = auth.uid()
          or (a.visibility = 'shared' and public.is_household_owner_or_editor(a.household_id))
        )
    )
  );

-- 7) Safe projection for Balance-only accounts (rule D) -- exposes only
--    name, type, currency, and balance (current_balance_cents) to
--    non-owner household members. `id`/`household_id` are included as
--    structural row-identity fields (needed for the view's rows to be
--    addressable/groupable at all), not part of the literal 4-field
--    content list -- flagged, not silently assumed to be covered by it.
--    security_invoker is explicitly false: this view supplies its own
--    complete authorization logic below and deliberately does not rely
--    on accounts' own RLS SELECT policy, since balance_only rows are
--    intentionally excluded from that policy (see deviation #1).
create or replace view public.accounts_balance_only_view
  with (security_invoker = false)
as
select
  a.id,
  a.household_id,
  a.name,
  a.type,
  a.currency,
  a.current_balance_cents
from public.accounts a
where
  a.visibility = 'balance_only'
  and a.user_id <> auth.uid()
  and public.is_household_member(a.household_id);

grant select on public.accounts_balance_only_view to authenticated;
