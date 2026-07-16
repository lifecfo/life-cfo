-- Add income confidence-tier classification and variable-income range
-- support to recurring_income.
--
-- Confidence tier distinguishes how certain the household's income figure
-- actually is:
--   - confirmed          -> a known, dated payment
--   - expected_recurring -> an inferred or user-confirmed regular pattern
--   - variable_estimate  -> a range or recent-pattern estimate
--
-- Existing rows default to 'expected_recurring' rather than 'confirmed' --
-- nobody classified them, and claiming "confirmed" for unverified data
-- would overstate certainty the app doesn't actually have.
--
-- amount_low_cents / amount_high_cents are additive, nullable range fields
-- used only for variable_estimate rows. amount_cents remains the single
-- "typical" figure every other page (Budget, Year at a glance) already
-- reads -- this migration does not change what that column means or how
-- it's used downstream.

alter table public.recurring_income
  add column confidence_tier text not null default 'expected_recurring';

alter table public.recurring_income
  add constraint recurring_income_confidence_tier_check
  check (confidence_tier in ('confirmed', 'expected_recurring', 'variable_estimate'));

alter table public.recurring_income
  add column amount_low_cents bigint;

alter table public.recurring_income
  add column amount_high_cents bigint;

-- Range fields are only meaningful together: both null, or both set with
-- low <= high. Never half-populated.
alter table public.recurring_income
  add constraint recurring_income_amount_range_check
  check (
    (amount_low_cents is null and amount_high_cents is null)
    or (amount_low_cents is not null and amount_high_cents is not null
        and amount_low_cents <= amount_high_cents)
  );

-- A range should only exist on a variable_estimate row -- a confirmed or
-- expected-recurring row shouldn't also carry a range.
alter table public.recurring_income
  add constraint recurring_income_range_only_when_variable_check
  check (
    confidence_tier = 'variable_estimate'
    or (amount_low_cents is null and amount_high_cents is null)
  );

comment on column public.recurring_income.confidence_tier is
  'How certain this income figure is: confirmed (known, dated payment), expected_recurring (inferred/user-confirmed regular pattern), or variable_estimate (range/recent-pattern estimate). Existing rows default to expected_recurring, not confirmed, since nobody explicitly classified them.';

comment on column public.recurring_income.amount_low_cents is
  'Lower bound of a variable-income estimate range. Null unless confidence_tier = variable_estimate. amount_cents remains the single figure other pages (Budget, Year at a glance) read -- this is additive display-only context.';

comment on column public.recurring_income.amount_high_cents is
  'Upper bound of a variable-income estimate range. Null unless confidence_tier = variable_estimate.';
