# Life CFO — page ownership map (v2)

Purpose: one page each shows this, so no two pages compete to explain the
same thing, and nothing falls through a gap between them.

v2 changes from v1: folds in a review pass (canonical concept table, Budget
redefinition, Goal/Provision/Allocation model, fact/estimate/intention
rule, sentence-rule refinement, Household/Settings split). Items explicitly
parked rather than adopted are marked as such, with reasoning — this
project's stated failure mode is trying to resolve everything before
building anything, so not every good idea from a review gets actioned
immediately.

Cross-page rules that apply everywhere, not repeated per page below:

- **Interpreted or decision-relevant numbers get a plain sentence. Raw
  records may use a clear label alone.** (Revised from v1's "every number
  gets a sentence" — that was too strict and would wall a transaction list
  in unnecessary narration.) Needs explanation: safe-to-spend, forecast
  balance, typical-month baselines, goal timing, net worth change, unusual
  payments, scenario impact. Doesn't: a transaction amount, a bill amount
  in a list, an account balance in an account list.
- **Fact / estimate / intention must be visually and linguistically
  distinguishable everywhere, not just on Year.** Fact: already happened
  or directly supplied ("Rent of $740 was paid on 9 July"). Estimate: what
  the app believes likely ("Next rent looks likely around 16 July").
  Intention: what the household chose ("You've planned to keep $1,500
  available"). This should govern line styles (solid/dashed), verb choice,
  and edit permissions consistently across every page.
- Color encodes category only, never performance/verdict. No red/green
  "good or bad," no judgmental encoding — but proportional/neutral visuals
  (e.g. a plain positional marker showing "used so far" against "planned")
  are fine as long as they represent composition, not a pass/fail grade.
- No gamification (streaks, points, badges) anywhere in the app.
- No dashboard customization in v1 — page layouts are fixed, not
  user-arranged.
- The ask/conversation input is anchored wherever it's useful, not
  Home-exclusive.
- **Every canonical financial concept has exactly one source and one
  calculation, no matter how many pages present it.** See table below.

---

## Canonical concepts (added in v2)

This is the layer underneath the page map — it stops the architecture from
fragmenting once real implementation starts, even if page ownership stays
clean.

| Concept | Canonical source | Canonical calculation | Presented on |
|---|---|---|---|
| Current cash | Accounts / balances | Household balance aggregation | Money Map |
| Expected income | Income records + detected recurrence | Expected-income derivation | Money Map, Year |
| Expected bills | Bills + detected recurrence | Expected-outgoings derivation | Money Map, Year |
| Typical month | Historical transaction truth | One shared baseline helper | Budget, Money Map |
| Planned (chosen) amount | Budget records | N/A — user-set, not derived | Budget |
| Earmarked money | Allocation records | One shared allocation model | Goals, Money Map |
| Safe-to-spend | All relevant inputs above | One shared reasoning helper | Money Map |
| Net worth | Assets, debts, balances | One shared valuation helper | Assets & debts |

**Open dependency, must resolve before build:** precise safe-to-spend
semantics — which balances count, how credit is treated, how far ahead
bills are deducted, whether allocated/earmarked money is excluded, how
missing data is handled. Flagged as the single most important calculation
in the product; do not let it get implicitly defined by whoever builds it
first.

---

## Home — LOCKED, with one addition

**One job:** surface the few things worth knowing right now, in plain
sentences, so someone can register them in ten seconds and act, ask, or
leave.

**Qualification rule for a dot (added in v2):** an item earns a spot on
Home only if it meets at least one of —
- materially changes the household's current position
- creates a near-term timing issue
- differs meaningfully from what was expected
- requires confirmation because it affects another calculation
- relates to something the household has flagged as a priority

Not simply "this is new." Without this test Home drifts into a feed.

**Home owns prioritisation, not explanation.** Every dot links out to the
page that owns the full story — Home itself never becomes the place that
explains, only the place that notices.

**Visuals:** none. Text dots only, capped around 3, "nothing unusual this
month" a valid and complete state.

## Money Map — LOCKED

**One job:** the complete, honest, present-tense picture, for people who
want to look rather than ask. Parallel path to conversation, not a
fallback.

**Conceptual structure to hold onto (added in v2):** Money Map should
always be answering — what's here now, what's already spoken for, what's
being held for later, what's genuinely flexible, what's owned, what's
owed, what's incomplete. In/Out/Saved/Planned, in practice.

**Safe-to-spend labeling note (added in v2):** keep the confident headline
label — do not push hedge language ("likely," "estimated") into the hero
itself, that reads as compliance-speak exactly where this app has
committed to plain confidence. The honesty belongs in the sentence
beneath it ("based on the bills I can see, not everything yet"), same
pattern as every other page.

**Visuals:** hero number (typography, no chart) for safe-to-spend; small
sparkline on "in," sentence-only (no chart) on "out"; icon list for recent
activity; neutral single-tone progress bars for goals snapshot; net worth
collapsed, one line + number.

**Does NOT own:** multi-month trend (→ Year at a glance), full transaction
search (→ Transactions), bill/income creation (→ Bills / Income), goal
creation/management (→ Goals), any verdict language anywhere.

## Year at a glance — LOCKED, scope needs defining before build

**One job:** what's already known to be coming, and whether any of it
creates a squeeze. Read-only calendar view, not a modeling tool.

**Open dependency (added in v2):** the dashed projected line needs an
explicit, stated scope — does it include confirmed future transactions,
manual bills/income, detected recurring patterns, budgeted amounts, goal
contributions, or estimated everyday spending? Whatever the answer, it
should ship with a plain sentence stating the scope (e.g. "this includes
known income, bills and planned costs — everyday spending is estimated
from recent months"), because a dashed line looks authoritative even when
built from partial data.

**Boundary clarified (added in v2):** Year owns the expected current path.
Decisions owns alternative paths built for a specific choice. Both may
share the same underlying forecast engine — this should be one engine,
not two.

**Visuals:** 12-month strip, plain tiles, small marker (not a color fill)
on flagged months only; balance line beneath, solid-to-now then dashed for
projected, with a marker synced to the same flagged month — never a second,
separate warning.

**Does NOT own:** daily granularity, bill/income editing (reads from Bills
/ Income, doesn't manage them), long-range (multi-year) modeling, general
historical/trend analysis (deeper trend questions go through Ask or
drill-down, not a Year reporting suite).

---

## Budget — redefined in v2, still needs its own full design session

**One job (revised):** the monthly plan the household has explicitly
chosen — what income is expected, what's planned for regular needs, and
what may remain. NOT "the typical month" — typical is observed behavior,
planned is a chosen intention, and these must stay two distinct values
even when compared to each other (e.g. "groceries have usually run closer
to $1,450 than the planned $1,200").

**Budget does get limited actual-so-far context (revised from v1's
stricter "no live totals" rule)** — a plan page that never shows how the
current month relates to the plan is hard to use. Format: planned / seen
so far / expected by month end, as context, not a grade. Money Map still
owns the household-wide interpretation of actual money movement; Budget
only shows enough to make its own plan legible.

**Risk flag, unchanged:** this remains the riskiest page in the app for
"explain, never judge." No "over budget," "behind," "failing," "at risk,"
"overspent" — ever. "On track" only if tied to a factual target with a
defined path, not as a vibe.

**Visuals (revised):** planned amount as typography (primary), used-so-far
as a subtle positional indicator — not a percentage-fill bar racing toward
a red "over" state. Proportional visuals are fine if they represent
composition, not performance.

**Does NOT own:** the household-wide "what actually happened" story (→
Money Map).

**Dependency:** Budget's planned-vs-typical comparison and Money Map's
"compared to usual" phrase must both read from the one shared "typical
month" baseline helper (see canonical concepts table) — never two
separately computed values that could quietly disagree.

## Bills — CRUD confirmed for beta; detection lifecycle explicitly parked

**One job:** create and manage recurring bills and their dates.

**Parked, not adopted (added in v2):** a review pass suggested Bills needs
a full detected/confirmed/likely/ignored/duplicate lifecycle for
transaction-detected recurring payments. That's real, correct design — for
the real-bank-data phase. It doesn't apply to demo-data-only beta scope,
per the original project brief ("don't let compliance/transparency/advice
creep into must-have for the demo"). Note it here so it isn't lost, but do
not block Bills' current design on it.

**Visuals:** plain list — name, amount, frequency, next date. No chart, no
insight framing.

**Does NOT own:** forecast shape (→ Year at a glance reads from this
data), current-month totals (→ Money Map).

## Income — same treatment as Bills

CRUD page for income sources, plain list, no insight visuals. Same
detection-lifecycle note as Bills applies and is equally parked for the
real-data phase — do not overbuild the domain model for beta, but avoid
hard-locking it to fixed-salary-only assumptions if that's cheap to avoid
now.

**Does NOT own:** forecast (→ Year at a glance), current totals (→ Money
Map).

## Goals — model resolved in v2 (see below); spec can now proceed

**Resolved model, replacing v1's "merge or justify" framing:**

- **Goal** — a desired future outcome the household wants to build toward
  (home deposit, holiday, new car).
- **Planned cost** — a known future expense money may be set aside for
  (rego, Christmas, school fees) — not emotionally a "goal," but real.
- **Allocation** — existing cash currently linked to a goal or planned
  cost. This may not need to be its own visible product surface at all —
  it can be the invisible link between cash and a purpose.
- **Buffer** is a goal/reserve type, distinguished by being
  continuously-maintained rather than completed-and-spent — worth a
  purpose type (build toward / maintain / pay by date) rather than a
  special case.

This lets "Cash Plan buckets" disappear as a customer-facing term entirely
without losing the underlying allocation logic — it becomes internal
plumbing feeding safe-to-spend, not a section competing with Goals.

**Visuals:** goal/planned-cost cards with plain-language status, neutral
progress bar. Legitimate place for genuine "honest progress" milestone
treatment — real visual delight tied to true progress, never manufactured
reward.

**Does NOT own:** the short summary version (→ Money Map's goals snapshot
links here).

**Still open:** whether "planned costs" is a section within Goals or its
own nav-level page. Proposed default: section within Goals for beta,
revisit if it grows.

## Accounts — scope widened slightly in v2

**One job:** the list of connected accounts.

**Addition:** if allocations exist, Accounts should show factual
attributes that affect what a balance means — e.g. "$5,000 is currently
linked to household purposes" — without itself interpreting what that
means overall. Factual, not narrative: account type, ownership,
available-vs-current balance, linked purpose amount, sync status.

**Does NOT own:** any narrative about what the balances mean (→ Money Map,
Home).

## Transactions — job widened in v2

**One job (revised):** search, inspect, **and correct** the household's
transaction record — not a read-only viewer. Corrections (merchant,
category, transfer, split, duplicate, excluded, recurring relationship)
happen here because this is the canonical record everything else derives
from; get it wrong here and Budget, Money Map, and Year inherit the error.

**Visuals:** dense list/table, search/filter, same category icon system as
Money Map. A single functional summary line for the current filter (count
+ total) is fine; per-row captions are not needed — this page states
facts, it doesn't narrate them.

**Does NOT own:** the short "recent activity" glance (→ Money Map owns
that, pulls the last 5–8 only).

## Assets & debts — care principle sharpened in v2

**One job:** owned/owed + investments — full net worth, liabilities,
investments consolidated. Flagged as needing real build work, not just a
merge.

**Care principle (sharpened):** debt must not be treated as morally
negative, but plain language must not become evasive either. State it
plainly: "The household currently owes approximately $486,000 across two
debts." Neutral and clear beats a euphemism that softens the fact into
vagueness.

**Naming note:** "Assets & debts" undersells investments if they're a
major section; consider "What we own and owe" as a plainer, less
alienating alternative to "Net worth" or "Wealth" — worth deciding
deliberately rather than defaulting.

**Does NOT own:** the quiet teaser (→ Money Map's collapsed net worth
section links here).

## Decisions — boundary refined in v2

**One job:** think through a specific choice — the wedge. Structured
conversation, not a dashboard.

**Refined boundary:** Decisions does own forecasting — scenario-specific
forecasting, built on the same engine Year uses. The distinction is Year
owns the expected current path; Decisions owns alternative paths built for
a specific choice. A decision should always start from the same baseline
truth shown elsewhere in the app — never a different current-cash number
just because the user entered a decision flow.

**Visuals:** no fixed chart, but a recognizable comparison grammar is
worth keeping consistent across decision types — current path, scenario
path, key differences, affected months, assumptions, uncertainty — even
though the underlying data changes every time.

**Does NOT own:** the expected current path itself (→ Year at a glance);
Decisions may pull from Year's data but doesn't replace it.

## Set up — kept as-is for now (v2 restructuring proposal explicitly parked)

**Parked, not adopted:** a review pass proposed dissolving Set up into
"Your information" (folding in Accounts, Transactions, Bills, Income,
Goals, Rules, Connections, Imports) plus a firmer Household/Settings
split. That's a real navigation-architecture question, but navigation was
already explicitly decided in the original project brief, and a
page-ownership pass isn't the right place to silently rewrite it. Worth
raising as its own deliberate decision later — not adopted here.

**One job (unchanged):** connect accounts, import data, manage rules and
categories. Mostly one-time configuration.

**Visuals:** none — forms and lists only.

## Household + Settings — split adopted in v2

**Adopted:** treat Household and Settings as conceptually distinct, even
though they may share one nav grouping for beta. This isn't new
restructuring — the original nav sketch already listed them as separate
items; this just resolves an inconsistency between that sketch and v1 of
this map, rather than introducing a new decision.

**Household owns:** household identity, members, roles, invitations,
access, shared-vs-personal visibility. Treated as architecturally
significant even while the UI stays minimal for beta — real household
transparency is out of demo-beta scope per the original brief, but the
data model shouldn't have to be reworked later to support it.

**Settings owns:** app preferences, notifications, privacy, security, data
export/deletion, subscription, legal.

**Visuals:** none — standard settings UI for both.

---

## Summary of what changed in v2

**Adopted now:**
1. Canonical concept/calculation table
2. Budget redefined — chosen plan vs. typical, with limited actual context
3. Goal / Planned cost / Allocation model (replaces "merge buckets into
   Goals or justify separately")
4. Fact / estimate / intention as a global cross-page rule
5. Sentence-rule refined to "interpreted numbers only," not every number
6. Transactions' job widened to include correction, not just viewing
7. Household/Settings kept conceptually distinct (resolves a v1
   inconsistency, not new scope)
8. Home's dot-qualification test
9. Safe-to-spend headline stays confident; hedge lives in the caption

**Explicitly parked — flagged, not forgotten, not blocking current work:**
1. Setup → "Your information" restructuring (navigation was already
   decided; revisit deliberately, later)
2. Bills/Income detected-recurring-payment lifecycle (real-bank-data
   phase concern, not demo-beta)

**Still open, blocks nothing right now, but needs resolution before those
specific pages are finalized:**
1. Precise safe-to-spend semantics (which balances, how credit is
   treated, etc.)
2. Year's projection scope (what exactly feeds the dashed line)
3. Whether "planned costs" is a Goals section or its own page
