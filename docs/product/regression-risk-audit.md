# Regression-risk audit — live pages vs. saved specs

Read-only audit. Purpose: for each spec saved this session, inventory what
the corresponding live page actually does, then flag real functionality
that exists live but is not mentioned or accounted for in the spec — the
things that would be silently lost if someone built strictly to spec and
discarded the current implementation.

This is **not** a style/copy/layout comparison. Colors, wording, and
visual polish differences are not flagged. Only actual functionality —
data sources, CRUD actions, computations, filters, validation logic,
real features — counts as "at risk."

No fixes, no decisions, no recommendations. Findings only.

---

## Money Map

Live page: `app/(app)/money/map/page.tsx`, backed by `GET /api/money/map`
(`app/api/money/map/route.ts`) → `deriveMoneyMap()` in
`lib/money/reasoning/deriveMoneyMap.ts`, plus a second, independently
loaded card backed by `GET /api/money/cash-plan` →
`deriveCashPlan()` in `lib/money/reasoning/deriveCashPlan.ts`.
Spec: `docs/product/money-map-spec.md` (v2).

### What exists live

Page chrome: "Refresh" (reloads Money Map and Cash Plan independently, each
with its own loading/error state), "Back to Money" link, a
mixed-currencies banner note when more than one currency is present.

1. **"Where the money is"** — three account groups (Cash accounts, Credit
   or debt accounts, Other accounts), classified by `accountGroup()` via a
   regex on `account.type` (`/credit|loan|mortgage|liabilit/` →
   credit_debt, `/cash|checking|cheque|savings|deposit|depository/` →
   cash, else other). Each group shows `totals_by_currency` and a
   per-account list: name, account_type, `source_label` (one of "Demo
   data" / "Imported" / "Manual" / "Connected", computed via
   `sourceLabel()` cross-referencing connection metadata), balance +
   currency.
   - **Note:** this classification is a second, independently-maintained
     implementation from Cash Plan's own `classifyAccount()` (which uses
     type+subtype against defined `CASH_TYPES`/`CREDIT_DEBT_TYPES` sets,
     not a regex on type alone) — the same account could in principle
     classify differently between this card and Cash Plan eligibility.
     **Update: resolved later this session — `deriveCashPlan.ts` now
     imports and uses `deriveMoneyMap.ts`'s `accountGroup()` directly,
     confirmed via direct code read. This note no longer reflects the
     live code.**
2. **"Cash Plan"** (loaded independently) — merged
   `account_backed_buckets` + `part_account_buckets` + `tracked_only_buckets`,
   capped at 6 visible with an "N more are tracked" note. Each bucket:
   name, backing status ("Account-backed" / "Part of account" / "Tracked
   separately" / "Needs review"), account label if backed, backed amount
   if any. A review-count banner appears when any allocation needs
   review. Backing this display is real validation logic in
   `deriveCashPlan.ts`: **12 distinct review/failure reason codes**
   (`invalid_allocation`, `missing_bucket`, `missing_account`,
   `household_mismatch`, `currency_mismatch`, `archived_bucket`,
   `archived_account`, `unavailable_account`, `non_cash_account`,
   `multiple_whole_allocations`, `whole_partial_conflict`,
   `partial_over_allocation`), plus rules preventing one account being
   whole-allocated to more than one bucket, preventing mixed whole+partial
   allocations on one account, and preventing partial allocations from
   summing above an account's visible balance. Explicit "For review only.
   Nothing has moved." framing is baked into the data contract.
3. **"Savings goals"** — `tracked_purposes.items`, a direct derived view of
   the **same `money_goals` table** the Goals page manages (via
   `deriveMoneyBuckets()`, filtered to active goals with `target_cents >
   0`, sorted primary-first then by `updated_at`). Shows title, a
   hardcoded `status_label` ("Tracked separately" — not a computed pace
   sentence), progress bar/percent, saved-so-far/target, still-needed +
   target month. `is_primary` and `notes` exist on the underlying data but
   are not rendered here.
4. **"What is already planned"** — two columns: Scheduled (merged
   `recurring_income` + `recurring_bills`, filtered to amount > 0) and
   Confirmed patterns (`transaction_pattern_confirmations` rows of kind
   income/bill).
5. **"What is coming up"** — merges three sources, capped at 8 total:
   upcoming bills (next 30 days), larger scheduled payments (beyond the
   next-30-day window, top 3), and a single "Everyday groceries" estimate
   item if one exists. Links to "View Year at a glance."
6. **"What needs review"** — up to 8 items from **5 distinct sources**:
   (a) bills/income missing a valid next date (links to `/income` or
   `/bills`), (b) an "unlinked goals" note if any savings-goal buckets
   exist (links to `/money/saved`), (c) a pending-pattern-confirmations
   count (links to `/money`), (d) a note when older reference-only sources
   exist (links to `/connections`), (e) a warning when expected bills
   exceed visible cash-account balances (links to `/money/planned`).

### What the spec covers

The spec's structure: 1) Safe-to-spend hero + Cash-today secondary + "ask
why" affordance to conversation, 2) In/Out cards (In: sparkline; Out:
category-breakdown bar + driver sentence), 3) Recent activity (5-8 items,
category icons), 4) Goals snapshot (status sentences only when notable),
5) Net worth (collapsed teaser), 6) Trust footer (freshness + scope).
Plus an anchored Ask input and an empty/new-user state.

The only real overlap: live's "Savings goals" card and the spec's "Goals
snapshot" section read from the same `money_goals` table — but the live
card has no plain-language status sentence (always "Tracked separately"),
where the spec requires one.

### At risk of being lost

- The **entire Cash Plan feature** — bucket-to-account allocation display
  and its 12-reason validation/review engine — has no representation
  anywhere in the v2 spec.
- The **entire "Where the money is" per-account breakdown** — the spec's
  "Cash today" is a single secondary number, not a full account-by-account
  list, and doesn't preserve the source-label concept (Demo data/Imported/
  Manual/Connected) at all.
- The **entire "What is already planned" card** (Scheduled vs. Confirmed
  patterns) — no equivalent section anywhere in the spec.
- The **entire "What is coming up" card** (upcoming bills + larger
  payments + grocery estimate, linking to Year at a glance) — the spec's
  "Recent activity" is about *past* transactions; there's no near-term
  lookahead section in the spec at all.
- The **entire "What needs review" card** and its 5 distinct review-item
  types — no analogous mechanism in the spec. Notably, the spec's own
  non-goals explicitly reject "a fourth, separately-named mechanism for
  things worth noticing" beyond Home's dots and Year's flagged months —
  so under a literal from-spec rebuild, none of these 5 real, working
  checks has anywhere to go, not even folded into the curation rule.
- Cross-page links tied to the Review card (`/money/saved`, `/connections`)
  would disappear along with it.
- The account-classification duplication noted above (`accountGroup()` vs.
  `classifyAccount()`) is a pre-existing internal inconsistency, not
  spec-caused — worth a rebuild noticing rather than silently picking one
  and assuming it was always the only implementation. **Update: resolved
  later this session — `deriveCashPlan.ts` now imports and uses
  `deriveMoneyMap.ts`'s `accountGroup()` directly, confirmed via direct
  code read. No longer at risk.**
- No safe-to-spend or breathing-room calculation exists anywhere in
  `deriveMoneyMap.ts` today — the spec's hero section is entirely new
  work, not a restyle of an existing number.
- No net-worth figure or teaser of any kind appears on the live page
  either — per the Household/What-we-own-and-owe findings below, net
  worth isn't even a unified live calculation yet (Net Worth never reads
  `investment_accounts`), so the spec's "Net worth" section is also net
  new integration work.

---

## Budget

Live: `app/(app)/budget/page.tsx` + `app/(app)/budget/BudgetClient.tsx`.
Spec: `docs/product/budget-spec.md`.

**Architecture note:** all data access is direct Supabase client calls
from `BudgetClient.tsx` — no dedicated `/api/budget/*` route exists. The
one API call (`/api/money/accounts`) is reused purely to resolve
`household_id`.

### What exists live

**Data sources:** `accounts` (non-archived balances → "Accounts total"),
`recurring_income` (active rows → monthly-equivalent income), `recurring_bills`
(active rows → monthly-equivalent bills), `budget_items` (id, household_id,
user_id, name, kind, amount_cents, cadence, active, sort_order,
created_at, updated_at).

**Realtime:** one channel, `budget_household_{householdId}`, listening to
`postgres_changes` on all four tables above; Live/Offline/Connecting
status chip; window-focus silent refresh; manual Refresh chip;
throttled/coalesced reload logic (1200ms, in-flight guard, queued-refetch
flag).

**Computed values:** `monthlyEstimate`/`monthlyFactor` (converts
weekly/fortnightly/monthly/quarterly/yearly cadence to a monthly
equivalent, applied to every item/income/bill row); `planMonthlyCents`
(sum of active items); `leftoverCents = income − bills − plan` (a
three-line waterfall); a `risk` state machine (`no_income` / `negative` /
`tight` [leftover < 5% of income] / `ok`), each with its own hint
sentence and color treatment; per-`kind` monthly subtotals; live
monthly-estimate preview while adding/editing an item.

**Grouping:** items grouped strictly by `kind` — `expense` ("Spending"),
`saving` ("Saving"), `sinking` ("Sinking fund") — three Section cards,
active-first then `sort_order` then name. Per-section pagination (top 5,
"Show all/less", "{n} more hidden" note). Free-text search filtering
items by name.

**Actions:** 12 quick-add starter chips (Groceries, Fuel/Transport,
Eating out, Kids, Health, Giving, Emergency fund, Buffer, Car repairs,
Medical, Gifts, Holidays — each tagged with a `kind` + `cadence`,
prefilling the add form); Add item form; per-item inline edit (6-column
grid: name/amount/cadence/kind/active/live estimate); Pause/Resume
toggle (optimistic, with rollback); Remove with toast **Undo** (restores
snapshot + reloads); "Edit Income"/"Edit Bills"/"Edit Accounts" shortcuts
to `/income`, `/bills`, `/accounts`.

**Other cards:** "Monthly picture" (income/bills/plan/leftover + risk
hint); "Inputs snapshot" (accounts total + edit shortcuts); footnote
disclaimer.

**Edge cases:** not-signed-in, household-resolution failure,
`budget_items` query error (items cleared, dedicated message), general
load failure, empty section, and individual failed table reads degrading
silently to `0` rather than erroring the whole page.

### What the spec covers

A composition bar (Essentials / Flexible & lifestyle / Goals & planned
costs / Unallocated); a three-number summary (Income planned → Planned
spend → Left unallocated); a stated-sentence for negative-unallocated
instead of a raw negative number; collapsible category rows with a
proportional seen-so-far bar (allowed to overflow without color/status
change); a summary-only "Goals & planned costs" row; a styled Unallocated
card; an Ask input; a no-plan-yet empty state offering (not auto-filling)
a typical-month baseline; an explicit monthly-only scope call; and a rule
that planned-vs-typical comparisons come from a shared "typical month"
baseline helper.

### At risk of being lost

- **All budget-item CRUD/management UI** — the spec's Layout section
  describes only a read/summary experience; nowhere does it describe the
  live Add/Edit/Pause/Remove mechanism that actually builds the plan.
- **Per-item cadence flexibility directly conflicts with the spec's
  stated scope.** Every `budget_items` row carries its own cadence
  (weekly through yearly), but the spec states "Explicit scope call for
  beta: Monthly periods only, no custom/flexible budget periods" — this
  reads as cutting an existing, actively-used feature (several quick-add
  starters default to weekly) without acknowledging it exists today.
- **No mapping from the live `kind` taxonomy (Spending/Saving/Sinking
  fund) to the spec's group taxonomy** (Essentials/Flexible &
  lifestyle/Goals & planned costs/Unallocated) — no per-item category
  concept or category color/icon field exists live at all.
- **12 quick-add starter chips** — not mentioned in the spec, which only
  describes an offered typical-month baseline (a different, more
  automated mechanism) as the empty-state path.
- **Search box + per-section "Show all/less" pagination** — not mentioned
  in the spec.
- **"Inputs snapshot" panel** (accounts total from the `accounts` table +
  "Edit Accounts" shortcut) — no mention in the spec.
- **"Estimated bills" as an explicit third line feeding the leftover
  figure**, sourced from `recurring_bills` — the spec's three-number
  summary has no separate bills line, and separately states bill
  management is not this page's job, creating a real risk that a
  spec-only build drops the `recurring_bills` data source and the
  bills-subtraction step entirely, not just the Bills-management UI
  (which the spec is right to exclude).
- **"Edit Income"/"Edit Bills" navigation shortcuts** — not mentioned.
- **Realtime status chip and the four-table subscription** — not
  mentioned at all.
- **Manual Refresh, focus-triggered silent refresh, and the
  throttle/coalescing logic** — not mentioned.
- **"Tight" risk state** (leftover < 5% of income, amber-styled) — the
  spec only describes the negative-leftover sentence; the near-zero
  threshold and its distinct treatment is unaddressed.
- **Undo on item removal** — not mentioned.
- **Active/Paused per-item state and its toggle** — the spec's category
  rows show only a planned amount and a seen-so-far bar; no pause/active
  concept appears anywhere in the spec.
- **Household-scoping via reused `/api/money/accounts`** — not itself a
  user-facing feature, but a real architectural dependency: a spec-only
  rebuild assuming a dedicated Budget API needs to independently
  replicate this cross-page household-resolution call or it will
  silently break.

---

## Goals

Live: `app/(app)/money/goals/page.tsx` (single file, no separate client
component). Spec: `docs/product/goals-spec.md`.

**Architecture note:** no dedicated `/api/goals/*` route — direct
Supabase calls to `money_goals` and `money_goal_updates`. Household
resolution uses `resolveActiveHouseholdIdClient()`, kept in sync across
tabs via a custom `ACTIVE_HOUSEHOLD_CHANGED_EVENT` and cross-tab
`storage` events.

### What exists live

**Data:** `money_goals` (id, user_id, household_id, title, currency,
target_cents, current_cents, status, deadline_at, notes, is_primary,
sort_order, created_at, updated_at — writes also set a legacy
`target_date` field alongside `deadline_at`); `money_goal_updates` (id,
goal_id, user_id, household_id, delta_cents, note, created_at, run_id).

**Computed:** `sortGoals()` (primary-first, then sort_order, then
recency); `hasPrimarySupport()` — a schema-tolerance probe that detects
whether the `is_primary` column exists at all and gates pin-related UI
accordingly; `percent()` clamped 0-999%; active/paused/done/archived
status buckets; relative-day labels for the updates feed.

**Actions:**
- Create/Edit goal form (name, currency, target, already-saved, optional
  target date, notes). Blank target/current default to 0 ("save as much
  as possible" mode). **Always sets `status: "active"` on every save** —
  editing a paused/done/archived goal silently reactivates it.
- **Set primary** (`markPrimary`) — clears `is_primary` on every household
  goal then sets it on the selected one; wrapped in try/catch so an
  absent `is_primary` column degrades to a "not available for this
  workspace yet" message rather than failing hard.
- **Progress quick-add/subtract chips** (+$10/+$50/+$200/+$1000/−$10/−$50)
  plus a manual amount+note entry, each writing to `current_cents`
  (floored at 0) and best-effort inserting an audit row into
  `money_goal_updates` (insert failures are silently swallowed).
- **Recent updates feed** — up to 8 most recent contribution rows with
  relative-day labels.
- **Status controls** — four direct one-click transitions (Active/Pause/
  Done/Archive), not a linear progression — any goal can move to any
  status directly.
- **Remove** — two-step: first click archives (if not already archived),
  second click on an archived goal performs a hard delete, best-effort
  cascading the associated `money_goal_updates` rows first.
- Header nav shortcuts to Money, Planned, Bills; a "Goals, Planned, and
  Cash Plan" info card with further shortcuts to Transactions and
  Connections.

**Display:** a "Focus" spotlight card for the active primary goal (or a
"calm anchor, not a dashboard" fallback message); two-column layout
(grouped goal list by status; Details panel with Summary/Progress/State
cards for the selected goal).

**Edge cases:** loading/signed-out states; empty state with example CTA;
a goal with no target renders as "$X saved" with no bar/percent at all
(open-ended mode); an archived goal hides all progress controls behind a
restore-first message; `money_goal_updates` read/insert errors degrade
silently rather than surfacing.

### What the spec covers

A unified Goals + Planned-costs page; a "purpose type" model (build
toward / maintain / pay by date) driving ring-vs-bar-vs-plain visuals;
allocation as an invisible account-linking mechanism; a hero header
(total set aside + count sentence); status sentences shown only when
notable ("behind" banned); milestone delight tied to real progress only;
an Ask input; a warm empty state.

### At risk of being lost

- **The entire "Primary goal" pinning system** — Focus spotlight card,
  `is_primary` field, schema-tolerant `markPrimary()`, and the pin
  chip/badge throughout — has no counterpart in the spec's hero-number-
  only header.
- **Multi-status lifecycle** (Active/Paused/Done/Archived with direct
  one-click transitions between any two states) — the spec's "What a
  person can do" list never mentions pausing, marking done, or the
  archived state's specific behavioral gating.
- **The two-step archive-then-delete removal flow**, including the
  best-effort cascading delete of update rows — deletion isn't mentioned
  in the spec at all.
- **The entire progress-update audit trail** — `money_goal_updates`
  table, the six quick-amount buttons, manual entry, and the 8-item
  recent-updates feed — the spec only says "Adjust target amount or
  date," with no incremental-contribution or history concept.
- **Per-goal currency** (each goal has its own currency, not a single
  household-wide one) — not mentioned in the spec.
- **Free-text Notes field per goal** — not mentioned.
- **Target-optional / "save as much as possible" mode** — a goal with no
  target renders with no bar/ring/percent at all; the spec's
  purpose-type model (ring/bar/plain) has no `purpose_type` field to key
  off of live, since the live "no target" state is a different mechanism
  entirely.
- **Optional due date available on any goal regardless of type** — live
  lets any goal carry a target date independent of any type
  classification; the spec ties due-date framing specifically to a
  "pay by date" purpose type that doesn't exist live.
- **Cross-page nav shortcuts** (Transactions, Connections, Money,
  Planned, Bills) — not mentioned in the spec's layout.
- **Multi-household reactivity** (goals/updates/selection reset on
  active-household change, detected via focus/custom-event/cross-tab
  storage events) — not addressed anywhere in the spec.
- **`upsertGoal` silently reactivates a goal's status on every edit** — a
  real behavioral side effect with no status-lifecycle concept in the
  spec to reconcile it against.
- **Schema-degradation resilience** (`hasPrimarySupport()` probing) — an
  operational feature with no mention in the spec.
- Confirmed for completeness: **no "Planned cost" entity exists in the
  live data model at all** — everything live is a single flat
  `money_goals` list with no purpose-type or planned-cost distinction.
  This is the spec adding scope, not the live page losing it, but it
  means the spec's Planned-costs section is entirely new build work, not
  a migration of existing data.

---

## Bills

Live: `app/(app)/bills/page.tsx` (single large file). Spec:
`docs/product/bills-spec.md`.

### What exists live

**Auth/household:** resolves household via a `lifecfo_household` cookie
validated against `household_members`, falling back to the user's first
membership row. Looks up the user's **role** (`owner`/`editor`/other) and
derives `canWrite`, gating every write action; a "View only" badge shows
for read-only members.

**Data:** `recurring_bills` (ordered active-first then next-due);
`bill_payments` (receipts, ordered recent-first, limit 20);
`household_members` (role resolution). Realtime channel on both tables
(granular INSERT/UPDATE/DELETE patching for bills, INSERT-only prepend
for payments), Live/Connecting/Offline chip, focus-triggered silent
reload, a 1500ms throttle with a pending-timer ref to coalesce rapid
reloads. A separate `AssistedSearch scope="bills"` widget queries
`recurring_bills` independently (by `user_id`, not household) for
typeahead suggestions.

**Sections:** search card; summary/filter card (badges: Active, Due 7d,
Due 14d, Worth checking; filter chips **All/Due 7d/Due 14d/Worth
checking**, persisted to the URL via `?filter=`, deep-linkable from other
pages); "Quick add" card (11 preset bill templates — Rent/Mortgage,
Electricity, Gas, Water, Internet, Mobile, Insurance, Car rego, Rates,
Childcare, Streaming — each prefilling name/cadence/autopay); Add form
(name, live-formatted amount, cadence, next-due datetime, autopay,
active); Bills list (name, Active/Paused badge, Autopay chip, cadence
chip, conditional "Worth checking" chip, amount, next-due, and a "Last
paid {date} • {amount}" line resolved from `bill_payments`); Receipts
card (recent payments with bill name/amount/date/note/source, 8-item
default expandable to 20).

**Computed:** `due7`/`due14` (active bills due within 7/14 days);
**autopay-risk detection** — `isAutopayRisk()`: active, not-autopay, due
within 14 days, surfaced as a badge, a filter, and a per-row chip;
`lastPaymentByBillId`; a **5-row visible cap** ("N more hidden — use
search to find anything") applied even to the unfiltered list.

**Mark-paid-with-receipt flow** — the core feature: cadence-aware
due-date bump (`bumpIsoByCadence`, handling day-of-month preservation
across month-length differences, e.g. Jan 31 monthly correctly landing on
Feb 28/29), an optimistic UI update, a `bill_payments` insert, a
`recurring_bills.next_due_at` update (with automatic rollback — deleting
the just-inserted payment — if the due-date update fails), and a toast
with **Undo** that performs a true compensating transaction: reverts the
due date server-side *and* deletes the created payment row, not just a
local UI revert.

**Other actions:** Pause/Activate (soft toggle, optimistic + rollback);
inline Edit (name/amount/cadence/due/autopay/active); Delete with toast
**Undo** that fully re-inserts the deleted row (preserving id/creator/all
fields).

### What the spec covers

Create and manage bills; a Bill-vs-Planned-cost boundary rule (never both
for the same expense, with a required migration-prompt validation when a
new Planned cost would duplicate an existing Bill — new policy, no live
equivalent); a plain flat-list layout (icon, name, cadence + next due
date, amount); an "ask about a bill" conversational hand-off; a
"parked" note that a detected-recurring-payment lifecycle is deferred to
the real-bank-data phase (correctly matches — no such lifecycle exists
live either).

### At risk of being lost

- **The entire mark-paid-with-receipt flow** — cadence-aware date math,
  the `bill_payments` write, and the compensating-transaction rollback if
  either write fails. The spec's action list ("Add, edit, delete a bill")
  has no equivalent concept; paying a bill is a wholly uncovered action.
- **Undo on mark-paid**, including its own DB-level compensating delete
  and distinct success/failure toasts — not mentioned anywhere.
- **Undo on delete** (full DB re-insert of the deleted row) — the spec
  says "delete a bill" but doesn't account for restore capability.
- **The Receipts card and per-bill "Last paid" line** — a real payment-
  history feature; the spec's flat-list layout has no room for and
  doesn't mention any receipt/history concept.
- **Autopay-risk ("Worth checking") detection** — badge, filter, and
  per-row chip — arguably in tension with the spec's non-goal ruling out
  "insight/chart framing," but it's a real, working computed signal
  absent from the spec either way.
- **Due-soon filters (7d/14d) with URL-persisted, deep-linkable state** —
  used for cross-page linking (e.g. from an internal "Engine" page) — the
  spec's plain flat-list description doesn't account for filtering or
  grouping by due-date proximity at all.
- **Autopay as a tracked, editable, displayed field** — omitted entirely
  from the spec's stated field list (icon, name, cadence + due date,
  amount).
- **Pause/Activate as a distinct action from Delete** — the spec only
  lists "add, edit, delete," with no pause/resume concept.
- **Role-based write permission gating** (`canWrite`, "View only" badge)
  — not mentioned in the spec at all.
- **11 quick-add bill templates** — not mentioned.
- **In-page typeahead search** (`AssistedSearch scope="bills"`) — a
  distinct mechanism from the spec's "ask about a bill" conversational
  hand-off, and not accounted for.
- **Realtime live-sync with status indicator, focus-refresh, and manual
  Refresh** — data-freshness behavior the spec is silent on.
- **5-row visible cap with a "use search to find anything" redirect** —
  the spec's unqualified "flat list" doesn't mention any
  truncation/pagination behavior.
- **Live currency-formatting-as-you-type on the amount input** — an
  input-handling detail, lower materiality but genuinely undocumented.

---

## Income

Live: `app/(app)/income/page.tsx` (single file). Spec:
`docs/product/income-spec.md`.

### What exists live

**Auth/household:** resolves household via `GET /api/money/accounts` (a
different mechanism than Bills' cookie+`household_members` approach). **No
role/permission lookup exists on this page at all** — no write gating,
unlike Bills.

**Data:** `recurring_income` (ordered active-first then next-pay).
Realtime channel `income_household_{id}` on `postgres_changes` (`event:
"*"`) — but unlike Bills' granular patching, **any** event triggers a
full silent reload rather than in-place state updates. Live/Connecting/
Offline chip, explicitly set offline on unmount.

**Sections:** summary card (Active count, Total sources count); Add form
(name, amount formatted **on blur** — not live-as-typed like Bills —
cadence, next-pay datetime defaulted to tomorrow 9am, active); "Your
income" list (name, Active/Paused badge, cadence chip, amount, "Next
{date}", Pause/Activate + Delete only — **no Edit/inline-edit capability
exists at all**, unlike Bills); header Refresh control.

**Actions:** `addIncome` (does not reset the next-pay field after adding,
unlike Bills' equivalent); `toggleActive` (optimistic + rollback);
`deleteIncome` with a toast **Undo** — but the Undo here **only restores
local UI state and reloads; it does not re-insert the deleted row into
the database** the way Bills' delete-undo does (a live implementation
gap between the two pages, noted for completeness, not itself a
spec-caused risk).

**No confidence-tier field or UI exists anywhere** in the live model —
every income row is a single fixed `amount_cents` with no
Confirmed/Expected/Variable classification or range representation.

### What the spec covers

Add/edit/delete an income source; a flat-list layout (icon, name, cadence
+ confidence tag, amount or range); a new confidence-tier data model
(Confirmed / Expected recurring / Variable estimate) as a plain-text tag
— explicitly new, no live equivalent; guidance to support
variable/irregular income going forward; "ask about income" hand-off; a
"parked" note on a detected-income lifecycle, correctly deferred.

### At risk of being lost

- **Toast-based Undo on delete** (regardless of its partial-restore
  limitation) — a real, working UI pattern not mentioned anywhere in the
  spec's "Add, edit, delete" description.
- **Optimistic update + rollback on Pause/Activate** — not mentioned.
- **Realtime live-sync with connect/offline status indicator**, including
  explicit offline-on-unmount handling — the spec is silent on
  data-freshness/sync.
- **Manual Refresh control** — not mentioned.
- **Summary counts card** (Active / Total sources) — not described by the
  spec's flat-list-only layout.
- **Amount-formatting-on-blur input handling** — lower materiality, but
  genuinely undocumented.
- Noted for completeness, not itself a loss risk since the spec is
  additive here: **Edit does not exist live at all** — the spec lists
  "add, edit, delete" but only Add/Pause/Delete exist today; this is the
  spec asking for more than live has, the reverse direction from a
  regression risk.

---

## Accounts

Live: `app/(app)/accounts/page.tsx` + `app/(app)/accounts/AccountsPage.tsx`,
backed by `GET /api/money/accounts` and (unused by this page)
`POST /api/money/accounts/manual`. Spec: `docs/product/accounts-spec.md`.

### What exists live

**Toolbar:** "Back to Money" and "Manage connections" (→ `/connections`)
chips.

**Data:** `accounts` table (id, household_id, name, provider, type,
status, archived, current_balance_cents, currency, updated_at,
created_at), filtered `archived=false` server-side, ordered by recency,
limit 200.

**Sections:** an `AssistedSearch scope="accounts"` widget; an Accounts
list card with a computed summary line ("{N} connected account(s), {M}
manual account(s). Last updated {date}."), a **separate local plain-text
filter** ("Filter locally...", distinct from `AssistedSearch`) searching
name/provider/type/status/currency client-side, and the row list.

**Per-row:** name (fallback "Untitled account"); a source line —
"Manual entry" for manual accounts, or "Connected via {Provider}" — with
a specific exception: **`isOlderPlaidAccount()` flags Plaid accounts
untouched for 30+ days as "Older test data via Plaid"** instead;
type/status/"Updated {date}" joined inline; currency-aware balance
formatting. **Rows are not clickable — no per-account detail view
exists.**

**Computed:** imported-vs-manual counts (`isImportedProvider`); latest-
updated timestamp across all accounts; provider label taxonomy
(manual/plaid/basiq/raw-uppercased); **client-side archived exclusion
applied again on top of the already-filtered server query**.

**Backend capability that exists but isn't reachable from this page:**
`POST /api/money/accounts/manual` (creates a manual account with a
name/type/currency/balance, requires owner/editor role, redirects to
`/money/import`) — no button or form on `AccountsPage.tsx` invokes it.

**Classification claim check (explicitly requested this audit):** the
spec states the page should be "Grouped by account type (Everyday,
Savings, Credit, Investments) — reusing the classification already
present in `deriveCashPlan.ts`." **This is inaccurate as written.**
`classifyAccount()` returns only three values (`cash` / `credit_debt` /
`other`), not four; `CASH_TYPES` treats checking/cheque/savings/everyday
as identical, with no mechanism to split Everyday from Savings; and there
is no "investments" category anywhere in the function — any investment-
type account falls into `other`, indistinguishable from a genuinely
unclassified account. The engine code cannot produce the spec's proposed
four-way split by "reusing" this function as stated.

### What the spec covers

The included/excluded toggle as a first-class control; per-account sync-
freshness display; grouping by account type; institution+name;
type+ownership label; available-vs-current balance distinction; linked-
purpose note; manual balance adjustment; connecting a new account; viewing
account detail; "ask about an account"; empty state.

### At risk of being lost

- **The local plain-text filter box** — a distinct mechanism from the
  spec's "ask about an account," not mentioned as a separate quick-filter
  control.
- **The aggregate connected-vs-manual summary line** and its underlying
  computation — the spec only discusses per-account freshness, not this
  household-level rollup.
- **Provider taxonomy/labeling** (Plaid/Basiq/Manual/raw) — not mentioned
  anywhere; the spec speaks only generically of "sync freshness."
- **Stale/old Plaid test-data detection** (`isOlderPlaidAccount`, 30+
  days) — not referenced in the spec at all.
- **Currency-aware balance formatting per account** — the spec is silent
  on multi-currency handling.
- **The redundant client-side archived-account filter** — a defensive
  behavior not addressed in the spec (low materiality, noted for
  completeness).
- **Toast-based load-error handling** surfacing the actual fetch error —
  the spec's only non-happy-path state is "no accounts yet"; a fetch/auth
  failure state isn't addressed.
- **The raw `status` field displayed verbatim per row** — narrower/
  different from the spec's proposed freshness vocabulary ("Synced
  today"/"Needs reconnecting"); the raw field itself isn't accounted for.

---

## Transactions

Live: `app/(app)/transactions/page.tsx` +
`app/(app)/transactions/TransactionsClient.tsx`, backed by
`GET /api/money/transactions`. Spec: `docs/product/transactions-spec.md`.

### What exists live

**Data:** `transactions` table (id, household_id, date, description,
merchant, category, pending, amount, amount_cents, currency, account_id,
connection_id, provider, external_id, created_at, updated_at), with the
API additionally joining `external_connections` server-side to detect
uploaded-CSV connections and annotate matching rows with `source_label:
"Uploaded bank file"`. A separate `GET /api/money/accounts` call
populates the account filter dropdown only.

**Filters card** (collapsible, active-count badge): Account, Pending
(`Any`/`Pending only`/`Cleared only`), From/To dates, and a **result-count
Limit selector** (50/100/200/250, hard-capped at 250) — all server-backed
via a query string. "Clear filters" and "Done" controls.

**Other chrome:** an `AssistedSearch scope="transactions"` widget;
Live/Offline/Connecting status chip; manual Refresh; "Upload a bank file"
shortcut (→ `/money/import`); "Back to Money"; a "Source context" summary
card (imported vs. manual counts, latest imported-update date); a
dedicated "Setup needed" error card on fetch failure (distinct message +
raw error text); a **"This month" total card** — computed from the raw
server-filtered `items`, independent of the user's own date-range filter
selection, shown only when items exist.

**List card:** header shows total count; a **second, separate local text
filter** narrowing the already-loaded set by
description/merchant/category/date (distinct from both `AssistedSearch`
and the server-backed Filters panel); "Show all/Show less" toggle over a
20-row default cap with a "{n} more hidden" note; each row expandable to
reveal only a static "No notes." placeholder — **no edit/action controls
exist on this page today**. Per-row: title, meta line (date | category |
"Pending" | source line), a sign-classification badge (In/Out/Zero via
`signLabel()`), Source/Amount/Updated chips, signed amount.
`isOlderPlaidTransaction()` applies the same 30+-day "Older test data via
Plaid" relabeling seen on Accounts. Window-focus triggers a silent
background refresh.

**Static footer:** "This page is intentionally quiet: it is for
orientation, not bookkeeping."

### What the spec covers

Search + filter controls (date range, category, account, amount range,
merchant); a single functional summary line (count + total) scoped to
the current filter; a dense list/table with category icons shared with
Money Map; tabular numerals; muted styling for excluded/transfer rows;
empty state. The spec's widened job — recategorize, split (validated to
sum to the original), mark-transfer, mark-duplicate, exclude, with
downstream-recalculation propagation — is **confirmed new**: none of
these actions exist live today. The live page is read-only. This is the
spec adding capability, not a regression risk.

Note also: the spec's filter set (date range, category, amount range,
merchant) doesn't match live's server-backed filters (account,
pending/cleared, result limit) — each has dimensions the other lacks,
in both directions.

### At risk of being lost

- **Pending/Cleared status filter** — a real, server-backed filter
  dimension not in the spec's filter list at all.
- **Result-count Limit selector** (50-250, server-backed) — not mentioned.
- **The second, separate local text filter** — the spec's single "search
  + filter controls" framing doesn't account for two independent search
  mechanisms coexisting (`AssistedSearch` + server filters + local
  filter, three total).
- **"Show all/Show less" progressive-reveal pagination** — the spec's
  "dense table, not artificially sparse" framing doesn't address this
  hide/reveal behavior.
- **Live/Offline/Connecting status chip and manual Refresh** — not
  mentioned.
- **"Upload a bank file" shortcut** from this page — a data-ingestion
  entry point not in the spec's action list.
- **"Source context" summary** (imported/manual counts, latest import
  date) — not mentioned.
- **Server-side uploaded-bank-file provenance detection** (the
  `external_connections` join and metadata check) — not referenced.
- **Stale/old Plaid test-data relabeling** — not mentioned.
- **The "This month" fixed-period total**, computed independent of the
  user's active date filter — distinct from the spec's proposed
  filter-scoped summary line; the "always current-month regardless of
  active filters" behavior isn't addressed by that concept.
- **Window-focus-triggered silent auto-refresh** — not mentioned.
- **The dedicated "Setup needed" fetch-error card** — the spec's empty-
  state section only covers "no transactions exist yet," not a load/auth
  failure.
- **Pending-flag display per row** and **the sign-classification badge**
  (In/Out/Zero) — computed row attributes not mentioned in the spec.
- **Per-transaction currency-aware formatting** — the spec is silent on
  multi-currency.
- **Archived-account exclusion in the account filter dropdown** — an
  edge case not addressed.

---

## Household

Live: `app/(app)/household/page.tsx` (thin wrapper) +
`app/(app)/household/HouseholdClient.tsx` (~1166 lines). Spec:
`docs/product/household-spec.md`.

### What exists live

**API surface:** `GET/POST/PATCH /api/households` (list/create/rename),
`GET/PATCH/DELETE /api/households/members`, `POST
/api/households/active` (switches active household, broadcasts the
change app-wide via `notifyActiveHouseholdChanged`), `POST
/api/households/{id}/leave`, `GET/POST/PATCH /api/households/invites`
(both outgoing, scoped to the active household, and **incoming**, scoped
to the signed-in user across **all** households they've been invited to),
plus demo-mode provisioning endpoints. `localStorage` persists dismissed
incoming-invite banner IDs, auto-pruned when an invite is no longer
pending.

**Multi-household support** — a user can belong to more than one
household; an "Active household" dropdown appears whenever more than one
exists, switching triggers a full members/invites reload and an app-wide
broadcast.

**Household creation flow** — a "Set up your household" card for
new/no-household users (name optional), creating and activating
immediately. A distinct **demo-mode branch** auto-provisions two sample
households once, with progress text, a "Retry setup" chip on failure, and
a support mailto link.

**Household details card** — inline rename (Save/Cancel, permission-
gated); a collapsible "Advanced" section with **"Copy household ID"**
(clipboard write, success/failure toasts).

**Three-tier role system (owner/editor/viewer)** — already-flagged known
discrepancy, included for completeness: `canRename` and `canInvite` both
gate on owner+editor; role management (assigning editor/viewer) gates on
owner only. This directly contradicts the spec's stated non-goal of "no
per-member permission granularity beyond Owner/Member."

**Member management** — per-member role dropdown (editor/viewer) for
non-owners; **"Make owner"** with a confirmation dialog (an extra caution
line appears when the target's display label is generic); **"Remove
member"** with confirmation; "you're the only owner" indicator; a
permission-gated fallback for non-owners viewing the list.

**Ownership transfer** — **"Step down as owner"** (only available with
more than one owner), its own distinct confirmation dialog; **sole-owner
protection** blocks both Leave and Step-down when the user is the only
owner, replaced with a message to add another owner first.

**Leave household** — confirmation dialog, clears local state, switches
active household if the response includes a new one.

**Invites — outgoing** — send (email + **viewer/editor** role — note, not
Owner/Member), a "Sent invites" list with age display and per-invite
Cancel.

**Invites — incoming** — a **separate list spanning all households**, not
just the active one, surfaced through **two independent UI locations**: a
dismissible sticky top-of-page banner (per-invite or all-at-once,
localStorage-persisted) and a "Waiting for you" list inside the Invites
card, each with independent Accept/Decline. Accepting auto-switches the
active household and broadcasts the change.

**Feedback system** — dual: an ambient status line plus toast
notifications for the same/adjacent actions, with independently tracked
loading flags per subsystem (members/outgoing invites/incoming
invites/demo status/demo setup).

### What the spec covers

Household name/label; a plain member list (avatar/initials, name, role,
active/pending status); an invite affordance; invite by email; remove a
member (owner-only); leave the household; a confirm-before-sending
pattern for invites (**not implemented live** — sends fire immediately,
the reverse-direction gap, noted not flagged); the Owner/Member-only
non-goal (contradicted live, already flagged).

### At risk of being lost

- **Multi-household membership and active-household switching**,
  including the cross-app broadcast mechanism — the spec doesn't mention
  a user can belong to or switch between multiple households at all.
- **The household creation flow** for new/no-household users — the spec
  assumes a household already exists.
- **Demo-mode household auto-provisioning** (auto-setup, retry, status
  polling, support link) — entirely absent from the spec.
- **The three-tier role system** with its distinct rename/invite/manage
  gates — already-flagged, included here for completeness.
- **"Copy household ID" / Advanced section** — not mentioned.
- **Ownership transfer ("Make owner" and "Step down as owner")**, each
  with its own confirmation flow — the spec has no ownership-transfer
  concept at all, only remove/leave.
- **Sole-owner protection logic** — not mentioned.
- **Incoming-invite accept/decline as a first-class feature**, including
  the dual sticky-banner + in-card surfaces and localStorage-persisted
  dismissal — the spec's "what a person can do" list only covers
  *sending* invites, never receiving/accepting/declining them.
- **Cancelling a pending outgoing invite** — not mentioned.
- **Role selection (viewer/editor) at invite time** — contradicts the
  spec's Owner/Member-only model.
- **Dual status-line + toast feedback with independently tracked
  per-subsystem loading states** — not addressed by the spec's minimal-UI
  description.

---

## What we own and owe

No single live page matches this spec's scope — it maps to **three
separate, independently-scoped live pages**: `app/(app)/net-worth/page.tsx`,
`app/(app)/liabilities/page.tsx`, `app/(app)/investments/page.tsx` (each
contains its full logic directly; none has a separate client component).
Spec: `docs/product/what-we-own-and-owe-spec.md`.

### Net Worth — what exists live

Reads `accounts` and `liabilities`, both filtered by `user_id` (not
household). Archived items on both tables are **always excluded, with no
toggle to reveal them** — unlike the Liabilities page itself, which does
offer one. **Full multi-currency bucketing**: groups by currency,
computing per-currency Assets/Liabilities/Net (each liability floored at
0 before summing), rendering one complete section per currency, sorted
alphabetically — each section lists its accounts (name + balance) and
liabilities (name + notes preview + balance). Entirely read-only — no
add/edit/delete on this page. **Confirmed: `investment_accounts` is never
read here** — investment values are not currently part of the net-worth
total at all; Net Worth and Investments are two independently-computed
numbers today, not integrated.

### Liabilities — what exists live

`liabilities` table, filtered by `user_id`. Add form (name, amount owed
parsed from formatted strings, currency — free-text, normalized to 3
letters, default AUD — notes). Inline per-row edit. **Archive/Restore** —
a soft-delete toggle, distinct from permanent deletion — plus a real
**Delete**, gated behind a native `window.confirm()` dialog. Filter chips
("Active" default vs. "All (incl. archived)"). Totals-by-currency computed
inline over the currently-visible (filtered) set.

### Investments — what exists live

**Household-scoped** (not user-scoped, unlike Net Worth/Liabilities) —
resolved via `GET /api/money/accounts`. `investment_accounts` table (id,
household_id, user_id, name, kind, institution, approx_value, currency,
notes, updated_at, created_at). **Realtime subscription** with a live/
offline/connecting status chip — any household member's change updates
everyone's view. Window-focus silent reload with a 1200ms throttle and
in-flight/queued-refetch guards.

Add/Edit composer: name, kind (fixed taxonomy — brokerage/super/crypto/
**property**/other), institution, approx value, currency, notes.
**Delete with optimistic removal + Undo toast**, including snapshot
rollback if the actual DB delete fails. Expandable rows; a Valued/
Unvalued badge based on whether `approx_value` is set. An **approx
total** across all items that is **currency-naive** — sums raw numbers
regardless of each item's own currency field, with no conversion or
per-currency grouping. List truncation (5 default, "Show all/less").
An `AssistedSearch scope="investments"` widget. A dedicated "Setup
needed" error card distinct from toast errors. Subtitle: "Inputs only.
This will feed Home orientation later" — confirming this data doesn't
feed anything else yet.

### What the spec covers

A hero number + one sentence stating both sides; a two-segment Owned/Owed
composition bar; a long-range historical net-worth trend line; Owned
group (property, vehicles, investment holdings, each verified/estimated
+ last-updated); Owed group (debt terms, observational sentences only
when notable); add/edit an asset or debt; manual valuation re-estimation
with a timestamp; an Ask input. Explicitly states net worth is "a shared
calculation... this page presents it, doesn't independently recompute
it" and that investments feed the figure — **this integration doesn't
exist live today**, confirmed above; it's net-new work, not a migration.

### At risk of being lost

- **Full multi-currency bucketing on Net Worth** (separate Assets/
  Liabilities/Net per currency, each with its own account/liability
  lists) — the spec's single hero number + composition bar has no
  mention of currency segmentation; a from-spec build risks collapsing
  this into one combined figure.
- **The Net Worth → Liabilities empty-state deep link** — not mentioned.
- **Archive/Restore as a distinct soft-delete lifecycle on Liabilities**,
  separate from permanent Delete, plus its "Active vs. All" filter — the
  spec's "add/edit an asset or debt" language implies only create/edit
  (and presumably delete), with no archive/restore concept; a literal
  build risks losing this and the native-confirm delete guard together.
- **Native `window.confirm()` guard before permanent liability delete** —
  not described by the spec at all.
- **Free-text per-liability currency with normalization, and the
  computed totals-by-currency** — the spec's single-figure model doesn't
  address multi-currency liabilities.
- **Household-level (not user-level) scoping and realtime multi-user sync
  for investments** — every household member sees/edits the same shared
  list live. The spec doesn't address this ownership model at all; if the
  merged page follows Net Worth/Liabilities' user-scoped pattern instead,
  this shared/realtime behavior would be lost.
- **Optimistic delete with Undo on Investments** — not described in the
  spec's "add/edit... view full detail" action list.
- **"Property" as a fixed investment kind** creates real overlap risk
  with the spec's separate "Owned" group property valuations — the data
  model doesn't cleanly split "investment" from "property/vehicle" the
  way the spec's layout implies; a literal rebuild could silently exclude
  property entered today as an investment `kind` if the new page queries
  a distinct property/vehicle entity instead.
- **List truncation UI on Investments** — not mentioned.
- **The currency-naive investment total** — an existing (if arguably
  imperfect) computation the spec doesn't address either way.
- **The dedicated "Setup needed" error state on Investments** — not
  covered.
- **Realtime status indicator, "Back to Home," and manual Refresh on
  Investments** — not mentioned.
- Confirmed for completeness: **no investment value currently flows into
  any net-worth calculation anywhere** — both the Investments subtitle
  and the Net Worth page's own query confirm this. The spec's unified
  owned/owed/investments figure is net-new integration work, not
  something to preserve from an existing computation.

---

## Year at a glance

Live: `app/(app)/money/year/page.tsx`, backed by `GET /api/money/year` →
`{ year: deriveYearMoneySummary(truth), timeline: deriveMoneyTimeline(year) }`.
Spec: `docs/product/year-at-a-glance-spec.md` (v2).

### What exists live

Header: title/subtitle, "Refresh," "Open Planned" link (→
`/money/planned`). Mixed-currencies banner note.

1. **Five-card stat row**: Expected regular money in, Expected planned
   bills, Larger scheduled payments (count), Savings goals (count — a
   *third* independent place goals appear, alongside Money Map and the
   Goals page itself), Months worth a closer look (count).
2. **"Year timeline"** — one SVG chart per currency: three colored
   polylines with per-month markers (money in — green, money out — dark
   gray, difference — blue), an amber marker on flagged months, gridline
   at zero, min/max/zero axis labels, month labels over a 12-month window
   starting the current month. An expandable "Monthly details" table
   (Month / Money in / Money out / Difference / Largest payment / "Worth
   noting" text). A footnote explaining the amber marker. A "What this
   shows" list of **up to 3 auto-generated commentary sentences** — names
   the first month where scheduled money-out exceeds money-in (or states
   none exists), states how many items need timing before they can
   appear, and a fixed disclaimer that the view only includes currently-
   added schedules.
3. **"Money seasons"** — per currency, a real statistical computation:
   median of each month's expected-bills total, with a "material
   difference" threshold of max($100, 15% of the median); months above
   that threshold are "heavier," below are "quieter," otherwise "fairly
   even."
4. **"Larger scheduled payments"** — up to 5 payments selected via a
   specific curation rule: groups bill occurrences by currency+name,
   keeps the largest occurrence with an occurrence count, takes the top 3
   by amount, then **guarantees any quarterly/annual/yearly-cadence item
   is included even if not in the top 3** (so a big infrequent bill isn't
   crowded out by a nominally-larger monthly one), backfilling to 5 if
   needed.
5. **"Savings goals"** — yet another independent rendering of the same
   `money_goals`-derived buckets (capped at 3 here, uncapped on Money
   Map), captioned "These are tracked goals, not projected future
   savings."
6. **"Timing needed"** (conditional) — lists income/bill items excluded
   from the whole view because they lack usable timing, each tagged with
   one of **two distinct reasons**: `missing_date` or `unsupported_cadence`.
   Supports **six cadences** (weekly/fortnightly/monthly/quarterly/
   annual/yearly) with real calendar-aware occurrence projection,
   including day-of-month preservation across month-length differences.

### What the spec covers

1) Flagged-month sentence(s) (1-2, or none); 2) 12-month strip (plain
tiles, tap-through to a scheduled-items list sourced from Bills/Income);
3) Projected available cash (single line, solid-to-now/dashed-projected,
one neutral flagged-month marker, no color/shading); 4) Scope sentence
(generated per household, per `forecast-balance-semantics.md` §6); 5)
Conversation (anchored ask, "what if" previews). Non-goals ban all color
beyond one neutral marker, daily granularity, multi-year modeling, and
on-page editing.

### At risk of being lost

- **The live three-series comparison chart** (money in / money out /
  difference, independently colored and plotted) is structurally
  different from the spec's single "projected available cash" line — and
  neither version currently computes a cumulative running-balance
  projection at all (`deriveYearMoneySummary.ts` computes per-month
  totals and a per-month difference, never a carried-forward balance).
  Worth stating plainly: the spec's central visual concept is new
  computation, not a restyle of what exists. Separately, if the existing
  view is discarded outright, the ability to see money-in and money-out
  as two independently legible series (not just their net) would be
  lost.
- **The "Monthly details" table** — a full per-month reconciliation
  (money in, money out, difference, largest payment, worth-noting reason)
  — has no equivalent in the spec, whose tap-through only proposes
  showing raw scheduled items from Bills/Income, not this computed
  reconciliation view.
- **The two distinct closer-look reasons** (`bills_above_income` vs.
  `heavier_scheduled_month`) would collapse into the spec's single
  generic "flagged month" concept unless deliberately preserved — the
  spec doesn't describe any reason taxonomy.
- **"Money seasons"** (median-based statistical heavier/quieter month
  classification) — entirely absent from the spec.
- **"Larger scheduled payments"**, including the curation rule that
  protects big infrequent bills from being crowded out — entirely absent.
- **The "Savings goals" card** (a third independent rendering of goals
  data) — absent; the spec's Year layout has no goals content anywhere.
- **The "Timing needed" card** and its two distinct exclusion reasons — a
  real data-completeness disclosure mechanism with no equivalent in the
  spec, which doesn't describe what happens to un-projectable items.
- **Six supported cadences with real calendar-aware projection math**
  (including day-of-month preservation) — the spec doesn't discuss
  cadence support at all; a naive rebuild could silently narrow this.
- **The five-card stat row** — no equivalent summary strip in the spec.
- **Full multi-currency support** (separate chart, seasons, and totals
  per currency, with independently computed y-axis scale per currency) —
  the spec is silent on multi-currency handling.
- The auto-generated "What this shows" commentary is actually a working
  precedent for the kind of per-household-generated scope sentence the
  spec calls for in its own Scope Sentence section — worth noting as
  something a rebuild could extend, though the spec doesn't reference it.
- **"Open Planned" header link** — a real navigational affordance not
  mentioned in the spec's layout.
