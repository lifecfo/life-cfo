# Accounts — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

## Its one job

The list of connected accounts — where money is held or owed. Factual,
not narrative. Widened scope (per page-ownership-map.md review): show
enough factual attributes to explain what a balance means, without
interpreting what it means for the household — interpretation stays
Home/Money Map's job.

## This page is the canonical source for two things other pages depend on

1. **The included/excluded toggle per account determines "cash today"**
   as defined in forecast-balance-semantics.md — "raw sum of *included*
   cash-type account balances." This is not a minor setting; it's the
   actual mechanism behind a number shown prominently on Money Map. Treat
   the toggle as a first-class, visible control, not buried in a details
   screen.
2. **Per-account sync timestamps are the source of Money Map's trust
   footer** ("Last updated today, from 5 connected accounts"). That
   footer should read real per-account freshness data from here, not
   maintain a separately computed figure. If an account needs
   reconnecting, that should surface factually here first.

## Visual system (references docs/product/visual-design-system.md)

- **Deliberately plain — no charts, no trend, no narrative.** Same
  register as Bills/Income, not Money Map/Budget/Goals.
- **Account icons stay neutral/muted, NOT drawn from the category
  palette.** The category palette has one specific meaning (spending
  category, consistent everywhere) — applying it to accounts would blur
  that meaning. Use plain institution/account-type icons instead.
- Tabular numerals on all balances.
- Grouped by account type (Everyday, Savings, Credit, Investments) —
  reusing the classification already present in the existing engine code
  (`lib/money/reasoning/deriveCashPlan.ts` classifies accounts as
  cash/credit_debt/other), not inventing a new taxonomy.

## Layout

Grouped list. Each row, factual only:
- Institution + account name
- Type + ownership label ("Everyday · Joint")
- Sync freshness ("Synced today" / "Synced 3 days ago" / "Needs
  reconnecting" — plain text, not alarm-colored even when stale)
- Current balance (tabular numerals)
- **Available balance shown separately where it differs from current**
  (credit card available credit, a pending hold) — never merged into one
  ambiguous figure
- Linked-purpose note where an allocation exists ("$2,000 linked to
  goals") — factual, links to Goals, doesn't interpret
- Included/excluded toggle, visible on the row, not hidden in a detail
  view

## What a person can do

- Toggle an account's inclusion in household calculations
- Connect a new account (hands off to Set up)
- Manually adjust a balance for an unconnected/manual account, clearly
  flagged as "manually entered" rather than live-synced
- View an account's own detail
- Ask about an account

## Non-goals

- No narrative about what a balance means for the household (→ Home,
  Money Map)
- No charts or trend of any kind
- No category-palette colors on account icons

## Empty state

Warm, brief invitation to connect a first account — same pattern as
Bills/Income, hands off to Set up's connect flow.
