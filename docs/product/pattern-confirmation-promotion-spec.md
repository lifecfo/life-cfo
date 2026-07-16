# Pattern confirmation → real bill/income promotion

Design-stage output. This is a cross-cutting mechanism doc, same
treatment as forecast-balance-semantics.md — referenced by
bills-spec.md, income-spec.md, and Money Overview's own implementation,
not restated in each.

## The problem this fixes

Confirmed via direct code investigation: `POST /api/money/pattern-
confirmations` (Money Overview's "Confirm as bill" / "Confirm as
income" actions) only writes a label into `transaction_pattern_
confirmations`. It never creates a row in `recurring_bills` or
`recurring_income`. A person can fully complete the recognition flow —
see a detected pattern, confirm it's their rent, confirm it's their
salary — and nothing durable happens anywhere Bills or Income would
show it. Every session, the same transactions re-detect as new,
unconfirmed patterns, because nothing ever graduates out of the
detection loop.

## The fix: confirming promotes a real row, it doesn't just label one

"Confirm as bill" should mean what it says. When a pattern is confirmed,
the app creates an actual `recurring_bills` (or `recurring_income`) row
from it — not a second, parallel confirmation system.

**This has a good consequence, not just a fix:** once confirming
genuinely creates the real row, Bills and Income don't need their own
duplicate review UI. Money Overview keeps doing what it's already good
at — noticing and orientation — and the result of confirming shows up on
Bills/Income exactly like anything added by hand, no separate surface
to maintain.

## What gets populated on promotion

The detection algorithm (`deriveTransactionOutflowSummary`) already
infers this — nothing needs re-deriving, just carrying across:

- **Name** — from the transaction pattern's normalized label.
- **Amount** — the most recent occurrence's amount, not an average.
  More likely to reflect what's actually due next than a smoothed
  figure would be.
- **Cadence / next due date** — derived from the pattern's inferred
  cadence and its last observed occurrence.
- **Income confidence tier (income promotions only):** lands on
  `expected_recurring`, not `confirmed`. This isn't a new rule — the
  tier's own definition already covers exactly this case: *"inferred or
  user-confirmed regular pattern."* The person confirmed the pattern is
  real; the specific future amount is still an inference, not a known,
  dated payment. `confirmed` stays reserved for something more certain
  than a detected pattern, however many times it's recurred.

## Schema addition needed

A nullable link column on both `recurring_bills` and `recurring_income`
back to the `transaction_pattern_confirmations` row that created it
(e.g. `source_pattern_confirmation_id`). Without this link:
- There's no way to find "the row this pattern created" when someone
  unconfirms it on Money Overview.
- Nothing prevents the same pattern being promoted twice if confirmed
  again after being put back for review.

## Staying in sync: unconfirming afterward

Money Overview's existing "Put back for review" action currently just
deletes the confirmation row. Once promotion is real, that action needs
to handle the row it created:

- **Deactivate, don't hard-delete**, the linked `recurring_bills`/
  `recurring_income` row (same `active` flag both tables already have).
  Hard-deleting risks orphaning real records — if Bills' payment history
  (`bill_payments`) already has entries against this bill, deleting it
  outright breaks that trail.
- **Warn at the moment of unconfirming** if the linked row has real
  activity attached (a payment recorded, a manual edit made since
  promotion) — the person should know unconfirming isn't a no-op once
  the row's been used for something.

## Source labeling — reuse an existing pattern, don't invent a new one

Accounts already distinguishes Manual / Plaid / Basiq / Connected as a
source label. A bill or income row created via promotion should carry
an equivalent "Detected" label, visually distinct from something typed
in by hand — same instinct already established, applied consistently
rather than as a one-off for this feature.

## Explicitly deferred, not decided here

Whether Bills eventually wants its own confidence-tier concept
mirroring Income's — a real, reasonable question, but out of scope for
this fix. Keeping this resolution scoped to closing the actual gap
(confirmed patterns disappearing into nothing), not growing it into a
second feature.

## Non-goals

- No duplicate review/confirm UI on Bills or Income — Money Overview
  remains the single place detection and confirmation happen.
- No automatic promotion without a person confirming — detection stays
  suggestion-only until acted on, same as today.
- No retroactive backfill logic for patterns confirmed before this fix
  existed — there's nothing to backfill; confirmed-but-unpromoted
  patterns from before this change simply get promoted the next time
  someone interacts with them (e.g. re-confirms, or the existing
  confirmation is read and lazily promoted — implementation detail, not
  a product decision).

## Cross-references

- `bills-spec.md` and `income-spec.md`'s "Correction" sections should be
  updated once this is built — their two open questions (does Bills
  surface its own review UI, or does confirmation get a promotion step)
  are answered here: promotion, no duplicate UI.
- Money Map's "Confirmed patterns" column (see money-map-spec.md v4)
  continues to read from `transaction_pattern_confirmations` as before
  — this fix doesn't change what Money Map displays, only what
  confirming actually does underneath.
