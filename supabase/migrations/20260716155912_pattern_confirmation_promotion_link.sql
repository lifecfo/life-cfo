-- Link recurring_bills / recurring_income back to the pattern
-- confirmation that promoted them, per
-- docs/product/pattern-confirmation-promotion-spec.md.
--
-- Nullable: most rows are still created by hand, not via promotion.
-- A partial unique index (active rows only) prevents the same pattern
-- confirmation being promoted into more than one currently-active
-- bill/income row at once -- re-promoting after a deactivation is still
-- allowed, since the old row is no longer "active" and can't collide.

alter table public.recurring_bills
  add column source_pattern_confirmation_id uuid
    references public.transaction_pattern_confirmations(id)
    on delete set null;

alter table public.recurring_income
  add column source_pattern_confirmation_id uuid
    references public.transaction_pattern_confirmations(id)
    on delete set null;

create unique index recurring_bills_source_pattern_active_uidx
  on public.recurring_bills (source_pattern_confirmation_id)
  where source_pattern_confirmation_id is not null and active = true;

create unique index recurring_income_source_pattern_active_uidx
  on public.recurring_income (source_pattern_confirmation_id)
  where source_pattern_confirmation_id is not null and active = true;

comment on column public.recurring_bills.source_pattern_confirmation_id is
  'Set when this row was created by promoting a confirmed detected pattern (see pattern-confirmation-promotion-spec.md). Null for hand-created bills. on delete set null: if the source confirmation is ever removed, the real bill this created stays intact.';

comment on column public.recurring_income.source_pattern_confirmation_id is
  'Set when this row was created by promoting a confirmed detected pattern (see pattern-confirmation-promotion-spec.md). Null for hand-created income. on delete set null: if the source confirmation is ever removed, the real income row this created stays intact.';
