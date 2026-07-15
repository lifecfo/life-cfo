# Money Map — page spec (handoff, v2)

Design-stage output. Supersedes the earlier saved version of this spec —
this reflects the fuller design pass done after the visual design-system
addendum was written, and should replace docs/product/money-map-spec.md
in place, not sit alongside it as a second file.

Build to this, not to what may currently exist in the repo.

## Its one job

Money Map is the canonical visual representation of the household's
current financial position. Every other page either contributes data to
it, explains part of it, or explores changes to it — this is the center
the rest of the app orients around, not just one page among twelve.

Money Map is the complete, honest, present-tense picture of where things
stand — for anyone who wants to look rather than ask. It is a parallel
path to conversation, not a fallback for when conversation fails, and not
the page most people will use most often. It is also infrastructure: when
a conversation answer needs to hand off to "look at the detail," it hands
off here, scrolled to the relevant section.

Explicitly NOT this page's job:
- Trend over multiple months (→ Year at a glance)
- Full transaction search/filter (→ Transactions)
- Bill/income creation or management (→ Bills / Income)
- Any verdict on whether the person is "doing well"

## Core rule

**Every derived or interpreted number ships with a plain-English sentence,
and that sentence only appears when genuinely notable against the item's
own typical pattern.** (Tightened wording — a previous version of this
rule technically contradicted itself by saying "every number" and then
immediately qualifying it. Raw facts — cash today, a goal's target amount
— don't need a sentence; derived/interpreted figures — safe-to-spend, an
"off pattern" category, a goal's pace — do, and only when notable.)
Numbers always show; sentences are earned, not default.

## Visual system (new in v2 — references docs/product/visual-design-system.md)

This page is the primary showcase for the design-system addendum. Use it
directly rather than inventing per-page styling:

- **Type roles:** Hero number for safe-to-spend (~34px, medium weight).
  Stat number for cash-today and in/out totals (~20-22px). Body for
  explanatory sentences (~15px). Caption for "seen so far"-style
  secondary context and the net-worth one-liner. All monetary figures use
  tabular numerals via the shared `<Money>` component — never
  ad hoc-styled per instance.
- **Category color palette:** the dedicated 8-slot palette (Juniper,
  Ochre, Terracotta, Plum, Slate, Sage, Dusty rose, Sand) — never the
  semantic/status tokens. Category color must be assigned via the
  deterministic mapping function (see design-system doc), not picked
  per-instance — a given category renders the same color everywhere on
  every page, not just consistently within this one.
- **Motion:** the Out breakdown bar and the goals progress bar fill from
  zero on load (~400-700ms ease-out). The safe-to-spend hero number counts
  up rather than appearing instantly. All motion respects
  `prefers-reduced-motion` — instant, non-animated fallback required, not
  optional.

## Section order (fixed — do not make user-configurable)

Ordered by concreteness, least abstract first. The page must never get
*less* abstract as you scroll.

### 1. Safe to spend (hero) + Cash today (secondary)
- Hero number + one-line sentence naming what was subtracted and why.
  Smaller secondary number alongside for raw cash position, clearly
  labeled as distinct from the hero.
- **Label stays confident — no hedge language ("likely," "estimated") in
  the headline itself.** The honesty lives in the sentence beneath it
  ("based on the bills I can see, not everything yet"), not in softening
  the number's own label. This was a deliberate call made after review —
  don't let compliance-style hedging creep into the hero later.
- **Small "ask why" affordance beneath the hero**, handing off to
  conversation with the question pre-filled (e.g. "why do you think I
  have $1,860 available?"). This is the trust/source-attribution
  mechanism for this number — deliberately routed through conversation
  rather than a separate drill-down UI tree, since Money Map and Ask are
  designed as equals, not one subordinate to the other. Building a
  parallel static explanation path would undercut that relationship.
- No chart here. Typography carries the visual weight.

### 2. Money in / Money out (this period)
- Two cards, not one combined card.
- "In": stat number + small sparkline (income arriving is low-stakes to
  visualize as a shape).
- **"Out": stat number + a real category breakdown, not just a plain
  sentence.** Segmented bar using the category palette, small color-keyed
  legend beneath, and a sentence naming the biggest driver — shown only
  when genuinely notable, same curation rule as everywhere else. (v2
  change: earlier version of this spec kept "Out" sentence-only with no
  chart, reasoning that a rising spend line reads as alarming regardless
  of cause. The segmented category bar solves that differently — it shows
  composition, not a trend line, so it doesn't carry the same "line going
  up" alarm signal. Revisit only if user testing shows the bar itself
  reads as judgmental, which it isn't expected to.)
- Optional inline phrase comparing to the person's own typical month —
  **always explain, never just compare.** "Higher than a typical month"
  on its own is a comparison with no reason attached and reads as closer
  to a verdict than intended; "higher than a typical month because of
  the annual insurance bill" is the actual bar. If there's no clear
  driver to name, don't show the comparison phrase at all — a bare
  "higher than usual" is worse than nothing. Single phrase only when
  used — this is NOT a trend chart; that's Year at a glance's job.

### 3. Recent activity
- Short list, 5–8 items, most recent first. Not the full ledger.
- Each row: category icon, colored per the same palette and mapping used
  in the Out breakdown directly above — this is deliberate visual
  continuity, the two sections should read as one color system, not two
  separate decisions.
- Purpose: lets the person verify totals against memory, builds trust in
  the numbers above.
- **Optional small context chip per row** where genuinely useful — "Annual
  payment," "Recurring bill," "Typical" — tiny, muted, not a category
  label (that's the icon's job). Purpose is recognition ("oh right,
  that's that payment"), not classification. Omit rather than force one
  onto every row.

### 4. Goals snapshot
- One line per goal: name + plain-language status. Use observational
  language only — "ahead of schedule," "on track," "contributing less
  than planned," "progress has slowed." **"Behind" is banned, same as
  "over budget" is banned on the Budget page** — this was an
  inconsistency in the original version of this spec, not a different
  standard for this page. Neutral single-tone progress bar, animated
  fill on load per the motion rules above.
- Status sentence only shown when a goal is notably ahead or behind — not
  a status line for every goal by default.
- Links out to the full Goals page. Do not duplicate Goals' management
  functions here.

### 5. Net worth
- Collapsed by default, always. One line of context (Caption weight) +
  the number, chevron to expand into the full breakdown.
- This is the one number most likely to carry unexamined shame for
  someone carrying debt. Deliberately quiet placement is a product
  decision, not an oversight — do not "fix" this by promoting it later
  without revisiting the reasoning here.

### 6. Trust footer (new — small, near the bottom of the page)

One quiet line combining data freshness and data scope, addressing "is
this current, and is this everything?" — both are trust questions,
answered together rather than as two separate sections:

> Last updated today, from 5 connected accounts.

Small, low-visual-weight (Caption role), not a banner or an alert. If an
account is out of sync or missing, this is where that gets surfaced
factually ("1 account needs reconnecting") — plainly, not as a warning
color or urgent styling.

## Conversation

Ask input is anchored on this page too, same component as Home. Not
Home-exclusive. Conversation-first applies across the app, not just the
front door.

## Empty / new-user state

No section renders zero-state charts or fabricated numbers. Replace with
warm, honest copy explaining nothing's connected yet, the same ask input
(usable before any account is linked), and a single clear CTA to connect
an account. Mirror Home's empty-state pattern — these two empty states
should feel like the same app, not two different products.

## Explicit non-goals for this build (do not add without revisiting product
discussion — these were deliberate exclusions, not gaps)

- **No dashboard customization / widget rearranging.** Choosing a layout
  is a decision burden the target user doesn't want. Revisit only as an
  opt-in personalization feature, post-beta.
- **No gamification** — no streaks, points, badges, completion counts, or
  celebratory animations tied to repeated engagement. Real-milestone
  celebration (see product principles: "journey as honest progress") is
  fine and encouraged; manufactured reward loops are not.
- **No red/green or any performance-coded color, anywhere on this page,
  including the new Out breakdown chart.** Color encodes category only.
  Category colors must come from the dedicated palette in
  visual-design-system.md, structurally decoupled from semantic/status
  tokens (see that doc for the exact token-collision finding that makes
  this a hard requirement, not a style preference).
- **No Money-Map-specific "attention" or "health indicator" feed —
  e.g. a section separately surfacing things like "largest upcoming bill
  in 5 days" or "cash spread across 4 accounts."** These belong to
  existing owners (Year at a glance owns upcoming-bill timing; the new
  account breakdown above already covers spread-across-accounts) or, if
  something is genuinely Money-Map-specific and notable, it should
  surface through the existing per-section curation rule already
  governing this page — not become a fourth, separately-named mechanism
  for "things worth noticing," alongside Home's dots and Year's flagged
  months. Considered and rejected during review, noted here so it
  doesn't get quietly re-proposed later.
- **No gender-targeted visual theme.**

## Open dependencies (must resolve before build)

1. The highlight/driver sentences (e.g. "mostly the insurance bill, not
   everyday spending") must be generated by a real rule against the
   underlying engine (largest driver of a delta, comparison to the
   person's own historical typical) — not hand-authored per instance.
   Same selection-rule problem as Home's dots; solving it once should
   serve both pages.
2. The category-to-color deterministic mapping function (hash or
   assignment table) referenced throughout this spec does not exist yet —
   needs to be built before the Out breakdown or recent-activity icons can
   be implemented consistently.
3. Precise safe-to-spend calculation semantics (which balances count, how
   credit is treated, how far ahead bills are deducted, how earmarked/
   allocated money is handled) are still undefined — flagged in the page
   ownership map as the single most important calculation in the product.
   Does not block building this page's UI, but must be resolved before
   the real number can be trusted.
