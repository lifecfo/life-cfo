# Transactions — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

## Its one job

Search, inspect, and **correct** the household's transaction record —
not a read-only viewer. This is the canonical record everything else
derives from: Money Map's recent activity and category breakdown,
Budget's seen-so-far, the shared typical-month baseline, and Goals'
progress tracking all trace back to this data. Getting a correction wrong
here doesn't just affect this page.

## Critical dependency — corrections must propagate, not just display

When a transaction is recategorized, split, marked as a transfer, or
excluded, any calculation that already used the old data (typical-month
baseline, Budget's seen-so-far, safe-to-spend's recent inputs) must
reflect the correction. This is a recomputation requirement on the shared
calculation layer described in page-ownership-map.md's canonical concepts
table — not something this page can solve by itself just by updating its
own row. Flag explicitly during implementation planning; a correction
that only changes what Transactions displays, without invalidating
downstream calculations, would silently reintroduce inconsistency this
whole architecture exists to prevent.

## Visual system (references docs/product/visual-design-system.md)

- **This is the one page where density is correct, not a design
  compromise.** The job is comprehensive access and correction, not a
  curated glance — resist adding the curation/sentence discipline used
  elsewhere; it doesn't apply here.
- Category icons: same palette and deterministic mapping as Money Map —
  deliberate visual continuity, not a separate system.
- Tabular numerals throughout — this is the densest number-heavy page in
  the app, alignment matters more here than anywhere else.
- Excluded/transfer transactions get muted amount styling, not strike-
  through or a status color — signals "excluded from calculations" as a
  fact, not a lesser or invalid transaction.
- **No per-row sentence or caption.** The "every derived number gets a
  sentence" rule correctly doesn't apply here — this page's job is
  access, not explanation. One functional summary line for the current
  filter (count + total) is the only narrative-adjacent text on the page.

## Layout

- Search + filter controls: date range, category, account, amount range,
  merchant.
- Summary line: "47 transactions, $4,380 total" — factual, scoped to
  current filter.
- List/table: date, merchant, category icon + label, amount, account.
  Desktop can stay a dense table; **mobile needs progressive row detail**
  rather than an artificially sparse ledger — flagged in earlier review,
  carried forward here explicitly.

## What a person can do (the widened job)

- Search and filter.
- **Recategorize** a transaction.
- **Split** a transaction across multiple categories — amounts must
  validate to sum to the original total, not just cosmetically divide it.
- **Mark as a transfer** — excludes from spend calculations, per
  forecast-balance-semantics.md's transfer-exclusion rule.
- **Mark as a duplicate** — manual only for beta. Automated duplicate
  detection is a real-bank-data-phase concern, same parking decision as
  Bills/Income's detection lifecycle — not built now.
- **Exclude from calculations.**
- Ask about any transaction or the current filtered set.

## Domain note, deferred but not designed out

Household/private classification (whose spending, shared vs. personal
visibility) is out of demo-beta scope per the original brief's household-
transparency deferral. Don't build UI for it now, but don't structure the
data model in a way that would require rework to add it later — same
principle applied to Income's variable-income handling.

## Non-goals

- No "recent activity" duplication — that's Money Map's short-glance job,
  this page is the full record, not a competing summary.
- No insight/chart framing of any kind.
- No per-row narrative sentences.

## Empty state

If no transactions exist yet (no accounts connected, or a freshly
connected account with no history), warm brief message, hands off to
Accounts/Set up rather than showing an empty table with no context.
