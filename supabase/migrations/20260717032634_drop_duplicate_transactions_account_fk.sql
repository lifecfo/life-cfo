-- transactions.account_id currently has two foreign key constraints to
-- accounts(id) with contradictory delete behavior:
--   transactions_account_fk       ON DELETE CASCADE   (kept)
--   transactions_account_id_fkey  ON DELETE SET NULL  (dropped here)
-- Having both active is leftover cruft, not a design choice -- Postgres
-- only needs one FK per column relationship, and two constraints with
-- opposing ON DELETE actions is ambiguous about what should actually
-- happen when an account is deleted. CASCADE is kept as the sole
-- behavior: deleting an account should remove its transactions with it,
-- not silently orphan them with a null account_id.
--
-- Confirmed via --linked before writing this: dropping the SET NULL
-- constraint does not touch any existing row -- this only changes what
-- happens on a future account delete, it does not delete or modify any
-- transaction now. (Context checked separately: 26 of the 40 accounts
-- with a null user_id have real transactions attached, 2106 total --
-- unaffected by this change either way.)

alter table public.transactions
  drop constraint transactions_account_id_fkey;
