# Bills — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

## Its one job

Create and manage recurring bills and their dates. A confirmed, dated
Bill is the highest-precedence input to any forecast calculation — see
forecast-balance-semantics.md §1. Utility page: mostly one-time setup,
occasional edits.

## Resolved: Bill vs. Planned cost boundary (new — read before building
Goals' allocation logic too, this affects both)

Same real-world expense (e.g. annual car registration) can be modeled as
either a Bill or a Planned cost (Goals) depending on household choice —
**never both at once for the same expense.**

- **Bill:** known amount + due date/cadence, paid from regular cash flow
  when it lands. No advance accumulation.
- **Planned cost:** the household is actively saving toward it ahead of
  time via an allocation (→ Goals page).

**Required validation:** creating a Planned cost for something that
matches an existing Bill (by name/amount/cadence similarity) should
prompt a migration ("move this to a planned cost you're saving toward?"),
never silently create a duplicate — a duplicate here breaks the
precedence rule in forecast-balance-semantics.md exactly the way the
Budget/Bills double-counting risk did.

## Visual system

Deliberately plain — this is a utility/management page, not an
exploration page. No chart, no insight framing, no rings or composition
bars. Per docs/product/visual-design-system.md: category-colored icons
(real palette, deterministic mapping) on each row for visual consistency
with the rest of the app, tabular numerals on amounts. That's the extent
of the visual treatment — resist the pull to add more once the richer
pages (Money Map, Budget, Goals) are built and this one looks plain by
comparison. Plain is correct here, not unfinished.

## Layout

Flat list: icon, name, cadence + next due date, amount. No sentences, no
per-row narration — this page states facts, Home/Money Map/Year do the
explaining elsewhere.

## What a person can do

Add, edit, delete a bill. Ask about a bill (hands off to conversation).

## Parked, not built now

A prior review proposed a detected/confirmed/likely/ignored/duplicate
lifecycle for transaction-detected recurring payments. Real, correct
design — for the real-bank-data phase, not demo-data-only beta scope.
Flagged so it isn't lost, not blocking this page's current build.

## Non-goals

- No forecast display on this page (→ Year at a glance reads from this
  data, doesn't need to be replicated here)
- No current-month totals (→ Money Map)
- No insight/chart framing of any kind

## Empty state

Warm, brief invitation to add the first bill — offered, not a blocking
wall before the rest of the app is usable.
