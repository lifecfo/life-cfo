# Goals rebuild — full spec (v1)

Design-stage output. Confirmed against the live database and three
independent code sources (matching exactly): `money_goals` currently has
15 columns, no `purpose_type`. This spec covers the schema addition, the
shared-type ripple effect, the form change, and the visual rebuild —
each reviewed as its own step, same discipline as every other schema
change this project has gone through.

**This is not a from-scratch design.** It implements the original
Goal/Planned-cost/Allocation-adjacent purpose-type model
(`goals-spec.md`) against what's actually live today, and it explicitly
preserves one real, working feature the original spec never accounted
for — the progress-log system.

## 1. Schema migration

```sql
alter table public.money_goals
  add column purpose_type text not null default 'build_toward'
    check (purpose_type in ('build_toward', 'maintain', 'pay_by_date'));
```

**Default choice, worth stating rather than leaving implicit:**
`build_toward` — the most common real-world case (a savings goal with an
amount target), and the closest match to how every existing goal is
currently rendered (a flat progress bar toward a target). The demo-seeded
goals get this default; nothing about their real data or behavior changes
as a result of the migration alone — only the rebuild work in sections
3-4 changes what they look like.

**Row count, verified live (not assumed):** 11 rows currently exist in
`money_goals` — not the 2 demo rows originally assumed before checking.
No backfill complexity regardless: the `not null default` applies to all
11 automatically: the migration itself needs no data-shaping step. If any
of the 11 should actually be `maintain` or `pay_by_date` rather than the
default, that's a manual edit through the rebuilt form (see Non-goals),
not something this migration decides.

## 2. Shared type update — real downstream reach, not just this page

`MoneyGoalsTruthRow` (`lib/money/reasoning/types.ts`) needs
`purpose_type` added. Confirmed its current field list (11 fields: `id,
title, currency, target_cents, current_cents, status, target_date,
deadline_at, notes, is_primary, updated_at`) matches exactly what
`getHouseholdMoneyTruth.ts` explicitly selects from `money_goals` today.

**This type update alone is not sufficient — one real, required step,
not just a type change:** `getHouseholdMoneyTruth.ts`'s fetch of
`money_goals` (around line 139) uses an **explicit column list**, not
`select("*")`. Adding `purpose_type` to the database and to
`MoneyGoalsTruthRow` does nothing on its own — the fetch's explicit
column list must also add `purpose_type`, or every downstream consumer
will see `undefined` regardless of what the type declares. `tsc` will
not catch this gap, since the type and the actual runtime data would
silently disagree.

Once the fetch is updated, this type feeds:

- `deriveMoneyBuckets()`
- `deriveHomeMoneySummary()`'s `primaryGoal()` (Home's spotlight)
- Money Map's goals snapshot section (via `deriveMoneyMap()`)
- Year at a glance's goals-related content (via `deriveYearMoneySummary()`)
- `deriveMoneySetupStatus()` (reads `truth.goals.length` only, for a
  count) — not listed in the original draft, included here for
  completeness

**None of these five need to change their own logic** — none of them
currently read or display purpose type, and adding a field to the type
doesn't break anything that doesn't reference it. This is a
type-widening change, not a breaking one, for all five consumers.
Confirm via a `tsc` check across all five during implementation — but
`tsc` only verifies the type-level claim; the fetch-layer step above is
what actually makes `purpose_type` real data, and needs its own explicit
verification (a live query or a console check), not just a clean
compile.

## 3. Form update

Add a purpose-type selector to the create/edit form — plain-language
options, not the raw enum values shown to a user:

- "Build toward" (a target amount to reach)
- "Maintain" (a reserve to keep topped up, no finish line)
- "Pay by date" (a target amount, but timing matters more than the
  amount alone)

Placed near the existing Target/Target date fields, since it changes how
those fields get interpreted downstream.

## 4. Visual rebuild — three render sites, one shared logic

Currently: `GoalRow` (list), the Focus/primary spotlight, and the
Details/selected-goal card all render byte-identical
`h-2 rounded-full bg-zinc-300` bars, regardless of purpose type. This
rebuild replaces all three with purpose-aware rendering, using the new
infrastructure built this session:

- **`build_toward` and `pay_by_date`** — a ring (has a real finish
  line). Uses a `.motion-fill`-equivalent treatment adapted for a
  circular stroke, current/target amounts via `<Money>`, current value
  animated with `useCountUp`. This distinction is exactly what
  `visual-design-system.md` §6 already names as a contextual-tip topic
  ("why a reserve doesn't get a ring but a savings goal does") — this
  rebuild is the first place it actually gets built.
- **`maintain`** — a plain bar, not a ring — a reserve has no finish
  line, and a ring would visually imply completion where none exists.
  Uses the same `.motion-fill` fill-from-zero-on-mount CSS added to
  `globals.css` this session. Worth noting plainly: `.motion-fill`
  currently has zero consumers anywhere in the app — Budget's own
  composition/category bars don't exist yet either (confirmed via the
  sidebar sweep earlier tonight) — so this would be the *first* real
  usage of that CSS, not a reuse of an established pattern.
- **A goal with `current_cents = 0` and no progress-log activity** —
  muted, dashed-border treatment, no ring/bar filled state at all —
  distinguishing "genuinely not started" from "started and low." This
  is a new pattern for this app, not a reuse — confirmed via grep that
  no dashed/muted zero-state treatment currently exists on Money Map's
  account-summary cards or anywhere else.

**Color:** goals aren't spending categories — don't pull from the
8-color category palette (that would risk implying a goal *is* a
category, which it isn't). Use a single, consistent accent tone across
all goal visuals, or a small number of goal-specific tones — worth a
quick design decision during implementation, not prescribed here in
detail. Confirmed this doesn't contradict `visual-design-system.md`: the
8-color palette (§1) was proposed specifically for spending categories,
explicitly disjoint from semantic/status/brand — nothing in that doc
says goals should draw from it.

**All dollar figures across all three sites migrate to `<Money>`** —
this is the first real page to consume the shared component built
earlier this session.

## 5. Explicitly preserved, not touched by this rebuild

This section exists because these are real, working features the
original `goals-spec.md` never accounted for — found during this
session's audit, and this rebuild must not silently drop them:

- **`hasPrimarySupport()`'s runtime detection pattern** — checking
  whether `is_primary` actually comes back on a `select("*")` before
  relying on it. Defensive, already correct, keep exactly as-is.
- **The entire progress-log system** (`money_goal_updates`): quick-add/
  subtract chips ($10/$50/$200/$1000), the manual amount+note input,
  and the 8-item "Recent" activity feed in the Details card. None of
  this is being redesigned — it's out of scope for the visual rebuild,
  and must still work identically afterward.
- **The four-bucket status grouping** (Active/Paused/Done/Archived) in
  the goals list — unrelated to purpose type, stays exactly as-is.
- **The archive-then-delete pattern** on the "Remove" action — stays
  as-is.

## Non-goals

- No change to the status enum (`active`/`paused`/`done`/`archived`) —
  purpose type and status are independent dimensions.
- No retroactive re-classification of the 11 existing goals beyond the
  migration's default — if any should actually be `maintain` or
  `pay_by_date`, that's a manual edit through the rebuilt form, not
  something this spec decides on their behalf.
- No changes to `money_goal_updates`' schema or API — the progress-log
  feature's data model is untouched, only the goal cards' visual
  treatment around it changes.

## Implementation order

1. Migration (section 1) — reviewed, applied via the trusted
   `db query --linked -f` → `migration repair` → verify sequence, same
   as every other schema change this session.
2. Shared type + fetch update (section 2) — add `purpose_type` to
   `MoneyGoalsTruthRow` **and** to `getHouseholdMoneyTruth.ts`'s
   explicit select list, then confirm via `tsc` that all five
   downstream consumers still compile clean with the widened type, plus
   a live/console check that `purpose_type` actually comes back on a
   fetched row (not just a clean type-check).
3. Form update (section 3).
4. Visual rebuild (section 4) — the largest piece, worth its own
   reviewed diff per render site rather than one combined change across
   all three at once, given how much surface area is involved.
