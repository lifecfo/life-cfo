-- Require accounts.user_id going forward. All insert paths now set it
-- correctly -- manual creation, demo seeding, and (as of this session's
-- earlier fix) both Plaid and Basiq sync. Safe to add with no backfill:
-- table has zero rows at the time of this migration. If this table ever
-- has real rows before this runs, STOP -- a null user_id on an existing
-- account would need a real ownership decision first (see
-- household-resource-visibility-spec.md's recommendation: default to
-- Shared visibility for any orphaned account, since no specific owner
-- can be determined).
alter table public.accounts
  alter column user_id set not null;
