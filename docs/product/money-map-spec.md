# Money Map — page spec (handoff)

Design-stage output from product/design chat. This is a specification for
implementation, not a description of existing behavior — build to this, not
to what may currently exist in the repo.

## Its one job

Money Map is the complete, honest, present-tense picture of where things
stand — for anyone who wants to look rather than ask. It is a parallel path
to conversation, not a fallback for when conversation fails, and not the
page most people will use most often. It is also infrastructure: when a
conversation answer needs to hand off to "look at the detail," it hands off
here, scrolled to the relevant section.

Explicitly NOT this page's job:
- Trend over multiple months (→ Year at a glance)
- Full transaction search/filter (→ Transactions)
- Bill/income creation or management (→ Bills / Income)
- Any verdict on whether the person is "doing well"

## Core rule

**Every number on this page ships with a plain-English sentence attached.
No bare stat, no bare chart, ever.** This is the structural differentiator
from Copilot/Monarch/PocketSmith, not a cosmetic add-on — do not let it be
optimized away as "just a caption."

## Section order (fixed — do not make user-configurable)

Ordered by concreteness, least abstract first. This ordering is a product
decision: the page must never get *less* abstract as you scroll.

### 1. Safe to spend (hero) + Cash today (secondary)
- Format: large hero number (safe-to-spend, i.e. cash netted against known
  near-term obligations) + one-line sentence naming what was subtracted and
  why. Smaller secondary number alongside for raw cash position, clearly
  labeled as distinct from the hero.
- No chart here. Typography carries the visual weight.

### 2. Money in / Money out (this period)
- Two cards, not one combined card.
- "In": stat number + small sparkline (income arriving is low-stakes to
  visualize as a shape).
- "Out": stat number + plain sentence naming the biggest driver of any
  swing (e.g. "mostly the annual insurance bill, not everyday spending").
  No sparkline here by default — a rising spend line reads as alarming
  regardless of cause; the sentence does the explaining instead.
- Optional inline phrase comparing to the person's own typical month
  ("about the same as usual" / "higher than a typical month"). This is NOT
  a trend chart — single phrase only. Do not let this expand into a
  multi-month view; that's Year at a glance's job.

### 3. Recent activity
- Short list, 5–8 items, most recent first. Not the full ledger.
- Each row: category icon (color = category, never performance) + merchant
  name + amount. No paragraph text.
- Purpose: lets the person verify totals against memory, builds trust in
  the numbers above.

### 4. Goals snapshot
- One line per goal: name + plain-language status ("ahead of schedule,"
  "on track," "behind") + neutral single-tone progress bar (no red/amber/
  green thresholds).
- Links out to the full Goals page. Do not duplicate Goals' management
  functions here.

### 5. Net worth
- Collapsed by default, always. One line of context + the number, chevron
  to expand into the full breakdown.
- This is the one number most likely to carry unexamined shame for someone
  carrying debt. Deliberately quiet placement is a product decision, not an
  oversight — do not "fix" this by promoting it later without revisiting
  the reasoning here.

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
- **No red/green or any performance-coded color.** Color encodes category
  only, everywhere on this page.
- **No gender-targeted visual theme.** If a visual-theme personalization
  feature is built later, it's an open choice for any user, not a
  segmented "for women" skin.

## Visual / craft direction

- Numbers are the primary visual device — invest in typography (size,
  weight, spacing) before reaching for a chart.
- One idea per card. A card holding two numbers, a caption, and a chart is
  too dense — split it.
- Category icons throughout (merchant/category), not just text labels.
- Real, generous use of color for category coding — this page should feel
  visually rich, not clinical. The constraint is on *meaning* (never
  performance-coded), not on saturation or richness.
- Motion should carry delight where used (smooth count-ups, cards settling
  into place) — never mechanics implying score or streak.

## Open dependency (must resolve before build)

The highlight/driver sentences (e.g. "mostly the insurance bill, not
everyday spending") must be generated by a real rule against the
underlying engine (largest driver of a delta, comparison to the person's
own historical typical) — not hand-authored per instance. This is the same
selection-rule problem raised for Home's dot points; solving it once should
serve both pages.
