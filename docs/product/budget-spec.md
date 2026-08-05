# Budget — page spec (handoff, v4 — full reconciliation)

Design-stage output. Supersedes v3 entirely. Product of a full
reconciliation against live `BudgetClient.tsx` per
docs/product/regression-risk-audit.md — not a redesign from a blank
page. Same treatment as Money Map's v4 reconciliation: most resolutions
here apply decisions already made elsewhere rather than inventing new
ones.

Build to this. If this conflicts with earlier versions of
budget-spec.md, this file wins.

## Its one job — unchanged

The monthly plan the household has explicitly chosen — distinct from
the typical month (observed behavior). This distinction stays exactly
as originally established; nothing in this reconciliation touches it.

## Resolved: cadence flexibility is not a scope violation

**Correction:** earlier versions of this spec stated "monthly periods
only, no custom/flexible budget periods" as a beta scope decision. Live
already does the right thing: each `budget_items` row carries its own
real cadence (weekly/fortnightly/monthly/quarterly/yearly), converted to
a monthly-equivalent figure for every summary display. This isn't a
conflict with monthly scope — it's the correct implementation of it. The
household plans in whatever cadence actually matches how a bill or habit
recurs; the page still displays and reasons about everything on a
monthly frame. No code change needed here — only the doc needed
correcting.

## Resolved: category taxonomy — adopt what's real, cut what was invented

**Correction:** earlier versions proposed Essentials / Flexible &
lifestyle / Goals & planned costs as the grouping taxonomy. This was
never built — live groups items by `kind`: **Spending / Saving / Sinking
fund**. Adopting live's real taxonomy as canonical; the invented one is
cut entirely.

**Worth noting, not resolved here:** "Sinking fund" describes the same
concept as "Planned cost" in the Goal/Planned-cost/Allocation model
(goals-spec.md) — rego, Christmas, school fees. A natural future
integration point (a Sinking-fund item optionally linking to a real
Planned cost on Goals) — flagged, not built, avoiding scope creep on
this reconciliation.

## Real correction needed in code, not just documentation: risk-color
coding

Live's risk state machine (`no_income` / `negative` / `tight` / `ok`,
computed from `leftoverCents` and its relationship to income) is
genuinely useful — but it's implemented with distinct color treatment
(rose for negative, amber for tight). **This directly contradicts this
page's own founding principle** — "no red bars racing toward an 'over'
state," established before any of this was built. The computation stays
exactly as-is; **the color-coding needs to be removed from the
implementation** and replaced with the same neutral typography already
used for every other sentence on this page. The hint sentence carries
the meaning; color must not.

## Layout (resolved, replacing the read-only v3 layout)

### 1. Composition bar + summary header
Segmented bar, re-keyed to the real taxonomy: **Spending / Saving /
Sinking fund / Unallocated** (not the cut invented groups). Beneath it,
the existing three-number "Monthly picture" (Estimated income →
Estimated bills → Expected budget items → leftover), unchanged from
what's live. If leftover is negative: a plain stated sentence, not a
raw negative number — unchanged from the original spec's intent, but
now delivered via neutral language, not color.

### 2. Grouped category sections: Spending, Saving, Sinking fund
Each a real Section card, matching live. Per-item: name, planned
amount (primary), a proportional fill bar for seen-so-far (colored per
the real category palette, per visual-design-system.md — never a
status/verdict color), comparison sentence only when genuinely notable.
**Curation behavior preserved from the original design intent:**
sections default collapsed unless something inside is genuinely
worth attention — this replaces the earlier "Essentials collapsed,
Flexible open" idea (which depended on the cut taxonomy) with the same
underlying principle, applied generically: quiet by default, open when
there's something to see.

### 3. CRUD — documented here for the first time, matches live exactly
- **12 quick-add starter chips** (Groceries, Fuel/Transport, Eating out,
  Kids, Health, Giving, Emergency fund, Buffer, Car repairs, Medical,
  Gifts, Holidays), each prefilling name/kind/cadence on the add form.
- **Add item form**: name, amount, cadence, kind, live monthly-estimate
  preview.
- **Inline edit** per item (6-column grid: name/amount/cadence/kind/
  active/live estimate).
- **Pause/Resume** (`active` toggle), optimistic with rollback.
- **Remove**, optimistic with a toast **Undo** restoring the pre-delete
  snapshot.
- **Search box** filtering items by name, plus **per-section "Show
  all/Show less"** pagination (top-5 default) — same pattern as Bills'
  5-row cap.

### 4. Inputs snapshot
Accounts total (sum of non-archived balances) + "Edit Accounts," "Edit
Income," "Edit Bills" shortcut chips. Real, useful, undocumented until
now.

### 5. Ask input
Anchored, same as every other page. **Still not built live** — this
remains a genuine gap between spec and reality in the other direction
(spec asks for something live doesn't have yet), not a regression risk.

## Empty / no-plan-yet state — unchanged intent, not yet built

Offered, never imposed: typical-month baseline suggested, not
auto-filled. Still aspirational — live has no dedicated empty state
distinct from an empty item list. Worth building, not yet resolved.

## Visual system (references visual-design-system.md)

Real category palette on per-item fill bars, deterministic mapping —
same rule as every other page. Tabular numerals throughout (not yet
applied live — same additive pass every other page received). Realtime
sync (four-table subscription, Live/Offline/Connecting indicator, focus-
refresh, manual Refresh, throttled reload) is real, working
infrastructure — document as existing, not a new design decision.

## Non-goals, reconfirmed and one corrected

- No verdict language ("over budget," "behind," "failing," "at risk") —
  unchanged.
- **No color-as-verdict, including the risk-state hints** — this is now
  an explicit non-goal rather than an implicit one, given the real
  violation found and flagged above.
- No dedicated Budget API — architecture stays as-is (direct Supabase
  calls, household resolved via the reused `/api/money/accounts` call).
  Not a gap, a documented dependency: a future rebuild assuming a
  dedicated backend needs to replicate this.

## Dependency, unchanged

Budget's planned-vs-typical comparisons still need the shared
"typical month" baseline helper from forecast-balance-semantics.md —
not yet built, same open item as before this reconciliation.

## Summary of what this reconciliation resolved

This reconciliation leaves outstanding work at three genuinely
different tiers. They're kept separate deliberately — collapsing them
into one flat list would understate how much real build work actually
remains, particularly for the last tier.

**Tier 1 — doc-only corrections, no code needed:**
1. Cadence flexibility — corrected the doc; live already does this
   correctly, nothing to change in `BudgetClient.tsx`.
2. Category taxonomy — adopted live's real Spending/Saving/Sinking
   fund, cut the invented Essentials/Flexible & lifestyle/Goals &
   planned costs groups.
3. CRUD and quick-add starters — documented for the first time; matches
   live exactly, nothing to change.

**Tier 2 — a real but contained code fix:**
4. **Risk-color coding** — flagged as a real code correction needed,
   not just a documentation fix: `pictureHintClass` in
   `BudgetClient.tsx` currently applies rose/amber coloring for the
   `negative`/`tight` risk states, contradicting this page's own "no red
   bars" founding principle. This is a contained, diffable change
   against code that already exists — same category and scope as the
   pattern-confirmation promotion fix, not new infrastructure.

**Tier 3 — genuinely unbuilt features, comparable in size to building
Goals' allocation UI, not a quick pass:**
5. **Composition bar — built this session; per-item "seen-so-far" fill
   bars — still unbuilt, reconfirmed this session.** The composition bar
   (Bills / Budget items / Leftover, a teal-opacity segmented bar, hidden
   on negative months) was added to `BudgetClient.tsx` during this
   session's rebuild pass — the earlier claim that "no composition-bar...
   code exists" no longer holds; that half of this item is resolved.

   The per-item fill bar remains exactly as unbuilt as when this
   reconciliation was first written, reconfirmed rather than assumed:
   it still depends on a "seen-so-far" computation — actual spend
   aggregated per budget item — that still doesn't exist anywhere in the
   codebase. `BudgetClient.tsx` still never queries transactions at all;
   neither this session's `<Money>` migration nor the new composition bar
   touched data-fetching in any way, so this blocker is entirely
   unaffected by either of those changes.

   **Explicit caution:** when this does get built, it must not be
   satisfied by rendering a bar with a faked, hardcoded, or permanently
   empty/zero fill just to visually match this spec's layout
   description — that would violate the same "no fabricated data"
   standard already enforced everywhere else in this app. The real
   aggregation logic (linking transactions to budget items/categories)
   has to exist first; the visual is the easy, later half of this work,
   not the part to build first.

   **This is a bigger lift than the risk-color fix above, not a
   smaller one alongside it.** Describing it in the Layout section in
   the same breath as CRUD and the Inputs snapshot (both of which
   already match live exactly) should not be read as implying it's
   close to done — it isn't started.
