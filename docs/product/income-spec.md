# Income — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

## Its one job

Create and manage recurring or expected income sources. Utility page,
same treatment as Bills.

## Resolves: income confidence tiers (closes a dependency from
forecast-balance-semantics.md §3)

That doc requires income to carry a confidence tier rather than being
treated as uniformly certain. This page is where that data originates —
every income source gets one of:

- **Confirmed** — a known, dated payment.
- **Expected recurring** — inferred or user-confirmed regular pattern
  (standard salary, etc.).
- **Variable estimate** — range or recent-pattern estimate (casual
  shifts, commissions, irregular work).

Displayed as a small, muted, plain-text tag next to each source — **not
a colored badge.** "Variable estimate" sitting next to "Confirmed" must
not read as a warning label next to a clean pass; it's a factual
distinction, not a quality signal. This is the same discipline as
everywhere else in the app, applied here specifically because it would
be easy to reach for status-colored tags on a page listing "confidence"
by name — resist that.

## Visual system

Same as Bills — deliberately plain, no chart, no insight framing.
Category-colored icons from the real palette, tabular numerals on
amounts. The confidence tag is the one piece of metadata unique to this
page; everything else matches Bills' treatment exactly for consistency.

## Layout

Flat list: icon, source name, cadence + confidence tag, amount (or a
range/estimate for variable income, clearly distinguished from an exact
figure — e.g. "~$600" rather than "$600" for an estimate).

## What a person can do

Add, edit, delete an income source. Ask about income (hands off to
conversation).

## Domain model note

Do not hard-lock the model to fixed-salary-only assumptions even though
the demo dataset may only need simple cases — variable/irregular income
is common enough that retrofitting it later would be more costly than
allowing for it now. Don't overbuild for beta, but don't design out the
possibility either.

## Parked, not built now

Same as Bills — a detected-income lifecycle for transaction-inferred
recurring income is real, correct design for the real-bank-data phase,
not demo-beta scope.

## Non-goals

- No forecast display here (→ Year at a glance)
- No current-month totals (→ Money Map)
- No insight/chart framing

## Empty state

Warm, brief invitation to add the first income source, same pattern as
Bills.
