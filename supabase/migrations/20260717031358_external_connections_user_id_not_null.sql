-- Require external_connections.user_id going forward. All three known
-- insert paths (app/api/money/connections/route.ts, app/api/money/basiq/
-- start/route.ts, app/api/money/import/csv/commit/route.ts) already set
-- it correctly -- this closes the gap at the schema level rather than
-- relying on code discipline alone. Safe to add with no backfill: table
-- has zero rows at the time of this migration. If this table ever has
-- real rows before this runs, STOP -- a null user_id on an existing row
-- would need a real decision (whose account is it?) before this
-- constraint could be added, the same category of problem already
-- resolved for accounts.user_id.
alter table public.external_connections
  alter column user_id set not null;
