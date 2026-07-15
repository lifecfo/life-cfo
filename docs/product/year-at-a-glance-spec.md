# Year at a glance — page spec (handoff, v2)

Design-stage output. This is the first full version of this spec — the
original design pass (job, strip, projected available cash, non-goals) is
carried forward unchanged except where noted; what's new here is
resolving the projection scope dependency and applying the visual design
system.

Build to this, not to what may currently exist in the repo.

## Its one job

What's already known to be coming, and whether any of it creates a
squeeze. Read-only calendar view, not a modeling tool. Owns the expected
current path; Decisions owns alternative paths built for a specific
choice — both may share the same underlying forecast engine, and should.

Explicitly NOT this page's job: daily granularity, bill/income editing
(reads from Bills/Income, doesn't manage them), multi-year modeling,
general historical/trend analysis (→ Ask or drill-down, not a reporting
suite here).

## Resolved: projection scope (previously an open dependency)

**Canonical source: the precedence hierarchy below is defined in
forecast-balance-semantics.md §1; this section applies that hierarchy to
projected available cash specifically, it doesn't re-derive it. If the
hierarchy changes there, revisit this section.**

Projected available cash is built from:
1. **Confirmed bills and expected income** — hard data, canonical source
   is Bills/Income.
2. **The household's own planned amounts from Budget**, for everyday
   spending categories.
3. **Fallback to the shared typical-month baseline** (same calculation
   Budget and Money Map already use) for any category without a plan set.

This gives Budget's chosen plan real downstream purpose — it's not just
displayed on its own page, it feeds the forecast directly — and it means
projected available cash is never shown without disclosing what feeds it.

**Scope disclosure is generated per household, not fixed.** Per
forecast-balance-semantics.md §6, the caption near projected available
cash must reflect the actual sources, fallbacks, and gaps used in that
specific household's calculation — never a single sentence that
overclaims completeness for everyone. Always visible, not optional, not
collapsible; Small, Caption-weight, positioned near projected available
cash itself. Example variants below illustrate the style only — none of
them is the fixed text:

- "This includes known income and bills, plus your planned amounts for
  everyday spending."
- "This includes confirmed bills, expected income and your monthly plan.
  Three everyday categories use recent typical spending because no plan
  has been set."
- "This includes known bills and income. Everyday spending isn't
  projected yet because there isn't enough recent history."

A dashed line looks authoritative regardless of what feeds it — this
disclosure, generated per household, is what keeps that honest.

## Visual system (references docs/product/visual-design-system.md)

- **Type:** month labels at Label weight. Any dollar figures shown on tap
  use tabular numerals via the shared `<Money>` component.
- **Color:** no category palette needed here — the strip and projected
  available cash use neutral tones throughout. The one exception is the
  small flagged-month marker, which should stay a plain neutral dot, not
  a color, consistent with the "no color-as-verdict" rule even at its
  most minimal.
- **Motion:** projected available cash draws in on load (~600-900ms
  ease-out) rather than appearing instantly — same discipline as Money
  Map's bar fills and hero count-up. Respect `prefers-reduced-motion`:
  instant, fully-drawn fallback required.

## Layout

### 1. Flagged-month sentence(s)
At most 1-2 plain sentences, shown only if a month is genuinely notable.
A fully quiet year shows none — this is a valid, complete state, not a
gap to fill.

### 2. 12-month strip
Plain tiles, current month anchored near the start, running forward.
Flagged months get a small neutral marker only — no fill, no color scale.
Tap a month to open a short, read-only list of what's scheduled, sourced
directly from Bills/Income — never a separate copy of that data.

### 3. Projected available cash
Beneath the strip. Solid up to "now," dashed for projected available
cash. A marker on projected available cash syncs to the same flagged
month shown in the strip above — one signal, shown two ways, never two
separate warnings. No shaded zones, no floor/threshold line, no color
change regardless of how low projected available cash dips — the
sentence above carries that meaning, projected available cash stays
neutral throughout.

### 4. Scope sentence
See "Resolved" section above — always visible beneath projected
available cash.

### 5. Conversation
Anchored ask input, same component as every other page. "What if"
questions preview against this data without committing a real edit —
actually changing anything hands off to Bills/Income, Budget, or
Decisions depending on what's being changed.

## Empty / no-data state

If no bills/income are connected yet, no strip or projected available
cash renders with fabricated data. Warm, honest copy inviting connection,
same ask input usable before any data exists — mirrors Home and Money
Map's empty-state pattern.

## Non-goals, reconfirmed

- No daily granularity (PocketSmith-style day-by-day forecasting adds a
  steep learning curve this audience doesn't need — monthly is the right
  resolution).
- No multi-year modeling.
- No editing on this page directly — preview only, real changes hand off
  elsewhere.
- No color beyond the single neutral flagged-month marker.
