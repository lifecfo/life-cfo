# Life CFO — visual design-system addendum

Design-stage output. Builds directly on the codebase audit (tailwind.config.js
+ globals.css, read-only investigation this session) rather than inventing a
system from nothing — the brand palette (teal/aqua/yellow/hibiscus) is real
and good; this fills in what's genuinely missing: category colors, type
scale, numeral handling, and motion.

**First, unrelated to design but found during the audit: `app/globals.css`
was corrupted in the working tree (overwritten with layout.tsx content,
uncommitted). Run `git checkout -- app/globals.css` before anything else
touches this area.**

---

## 1. Category color palette — net new, not reused from existing tokens

### The finding that drove this decision

The audit surfaced an exact collision, not a theoretical one:
`brand.aqua` (`#6FAFB2`) is the identical hex value to `semantic.info`.
`brand.yellow` (`#F2C94C`) is the identical hex value to `semantic.warning`.
`status.completed` (`#4FAF91`) matches `semantic.success` exactly, and
`status.active`/`status.pending` reuse `cfo.DEFAULT`/`brand.aqua`. The
existing token file already treats brand accent colors and status colors
as interchangeable in places. That means picking category colors "from
the brand palette" — the natural, low-effort instinct — would very likely
land a category directly on a status color by accident, because several
brand colors already *are* status colors under a different name.

### Decision: category colors are a wholly separate palette

Zero shared hex values with `brand`, `semantic`, `status`, or `alert`
tokens — not "different enough," genuinely disjoint, so no future
collision is possible even if someone later touches the semantic tokens.
Stylistically coordinated with the existing teal/hibiscus identity (muted,
warm-cool balance) rather than default web-safe hues.

Proposed set (8 slots — treat as a first pass for design sign-off, not
final):

| Slot | Name | Hex (proposed) |
|---|---|---|
| 1 | Juniper | `#3E7C74` |
| 2 | Ochre | `#C98A3E` |
| 3 | Terracotta | `#C1614B` |
| 4 | Plum | `#7A4B73` |
| 5 | Slate | `#5C6F8A` |
| 6 | Sage | `#7C9070` |
| 7 | Dusty rose | `#B4707E` |
| 8 | Sand | `#B8A47C` |

### Implementation note

Add as `category: { 1: ..., 8: ... }` (or similarly namespaced) in
`tailwind.config.js`, fully separate from `semantic`/`status`/`alert`.
Categories need a **deterministic mapping** to a slot (hash the category
id, or maintain an explicit assignment table) so a given category always
renders the same color across sessions and pages — not assigned randomly
per render. With user-created custom categories eventually possible, the
mapping function needs to cycle gracefully past 8 rather than break.

---

## 2. Typography

### Current state (confirmed by audit)
No custom typeface — running on Tailwind v4's default system font stack.
No defined type scale — sizes are ad hoc arbitrary values scattered per
screen (`text-[14px]`, `text-[15px]`, etc.), decided independently by
whoever wrote that screen.

### Open decision — needs your call, not mine
Whether to introduce a branded typeface is a real brand-identity decision,
not a technical one. Two honest paths:
- **Keep the system font stack.** Pragmatic, zero added weight, and
  system fonts are a legitimate, current design choice (not a compromise)
  — plenty of well-regarded finance apps do this deliberately.
- **Introduce a distinct typeface** for more brand character. Real cost:
  licensing/loading, and it's the kind of choice that's expensive to
  reverse once it's threaded through every screen.
Flagging as open rather than deciding it here.

### What should be defined regardless of that decision — a named type scale
Replace ad hoc per-screen sizing with shared, named roles:

| Role | Example size/weight | Used for |
|---|---|---|
| Hero number | ~34px, medium weight | Safe-to-spend, page-level headline numbers |
| Stat number | ~20-22px, medium weight | Secondary numbers (cash today, in/out totals) |
| Body | ~15px, regular | Explanatory sentences, plain-language captions |
| Caption | ~12-13px, regular, muted color | "Seen so far," labels, secondary context |
| Label | ~13px, secondary color | Section headers, category names |

This isn't about the specific pixel values — it's about having *named*
roles at all, so a component reads "this is a hero number" rather than a
hardcoded `text-[15px]` nobody can trace back to intent.

### Numeral handling — currently inconsistent, should be automatic
`tabular-nums` appears exactly once in the codebase (a CSV import table)
and is not applied anywhere near the actual money amounts on Home, Money
Map, Goals, etc. Rather than remembering to add it per-instance (which is
how it ended up applied in exactly one place), bake it into the shared
money-formatting layer: wrap `formatMoneyFromCents`/`formatMoneyFromAmount`
output in a shared `<Money>` component that always applies tabular figures,
so every amount in the app aligns and doesn't jitter on update by
construction, not by convention someone has to remember.

---

## 3. Dark mode — parked, not built now

`darkMode: ["class"]` is set in Tailwind config but entirely unconsumed —
no provider, no toggle, no `dark:` variants anywhere in the codebase. This
is real, non-trivial work (a theme provider, auditing every component for
dark-mode-safe colors, deciding how category colors behave against a dark
background). Recommend explicitly parking full dark mode as a post-beta
item, same treatment as the Bills/Income detection lifecycle earlier —
flagged so it isn't lost, not something blocking current page work.

---

## 4. Motion — currently near-zero, needs a lightweight spec

### Current state
No animation library (`framer-motion`, `motion`, `react-spring`, `gsap` —
none present). No keyframes. The only existing motion convention is a bare
Tailwind `transition` class on hover states (nav items, chips, buttons) —
nothing matching the count-up/settling-card language used in earlier specs,
which was aspirational, not implemented.

### Recommendation: don't reach for a new dependency yet
Most of what's needed here — bar fills, number count-ups, expand/collapse
— is achievable with plain CSS transitions and a small shared hook,
without adding animation-library weight to the bundle. Revisit a real
library only if genuinely orchestrated sequences are needed later.

### Motion rules to define
- **Bars fill from zero on mount/update**, ~400ms ease-out — never appear
  instantly at full width.
- **Numbers count up on load**, ~600-800ms — not a snap-in.
- **Expand/collapse (budget groups, net worth section, etc.)** animates
  height/opacity, ~200-250ms ease — not an instant show/hide.
- **Nothing implies urgency.** No bounce, no shake, no pulsing — motion
  here is about polish and legibility, never about drawing alarmed
  attention to a number.
- **Respect `prefers-reduced-motion`.** Anyone with that OS setting
  enabled should get the instant, non-animated version — this wasn't
  mentioned in earlier specs and should be treated as a baseline
  requirement, not an enhancement.

---

## 5. Chart grammar

Any page with a data-bearing line chart (Year at a glance, Money Map's
"In" sparkline, Assets & debts' net worth trend) should reference this
section rather than each re-deciding chart styling independently.

### Why this exists

An earlier pass at these charts used bare, unlabeled lines with no scale,
no data points, and neutral gray throughout — technically calm, but
genuinely under-informative ("shows almost nothing"). This section
defines a richer standard: real scale, real data points, real brand
color — while keeping the judgment-free discipline that governs
everything else in the app.

### The pattern

- **Gridlines for scale.** Evenly spaced horizontal reference lines with
  small value labels (e.g. $0/$2k/$4k/$6k). These are scale markers, not
  thresholds — evenly spaced and neutrally styled specifically so they
  can't be mistaken for a "danger line" at a particular value. If a
  gridline ever needs to sit at a specific meaningful value rather than
  an even interval, stop — that's a threshold in disguise and violates
  the no-floor-line rule.
- **Every data point gets a visible mark**, not just an abstract
  connecting line — small dots at each plotted point.
- **Area fill beneath the line**, low-opacity brand teal (`#1F5E5C`),
  purely for visual weight — not color-coded to value, applies
  identically whether the line is high or low.
- **Teal (`#1F5E5C`) carries the primary line and fill.** This is brand
  identity, not category or status color — using the house color for the
  primary chart line is normal design practice and doesn't carry the same
  collision risk as category colors, since it's not pretending to
  represent a specific category or a status state.
- **Projected/estimated segments render as teal at reduced opacity
  (~55%) with a dashed stroke** — NOT `cfo.light` or `brand.aqua`, which
  are both exact hex matches for `semantic.info` in the existing token
  file. Achieve the lighter look via opacity on the core teal value
  directly, never by reaching for the "light" brand token.
- **Hibiscus (`#9B3C6E`) marks a genuinely neutral point-in-time
  reference** — e.g. "now" on a forecast line. This is informational
  (today's position), not a judgment, and hibiscus doesn't collide with
  any semantic/status token.
- **Notable/flagged points stay uncolored — plain neutral marker
  (outlined circle, secondary text color), never brand or accent
  colored.** This is the one marker whose entire job is resisting a
  "this is good/bad" reading. Color anywhere else on the chart is fine;
  this specific mark stays deliberately neutral, on purpose, every time.
- **Yellow (`#F2C94C`) is not used on any chart for now.** It's an exact
  hex match for `semantic.warning` in the existing token file — using it
  anywhere data-bearing risks accidentally applying the literal warning
  color to something that isn't a warning. See "Open item" below for the
  actual fix.

### Open item: freeing up yellow

The real fix isn't "never use yellow" — it's that `semantic.warning`
shouldn't share an exact hex value with a brand color in the first place.
Changing `semantic.warning` to a distinct value (still visually
warning-appropriate, just not identical to brand yellow) would free
yellow for legitimate use anywhere, including charts. This is a small,
contained design-system change — worth doing deliberately rather than
leaving yellow permanently off-limits by default.

### Known overlap: teal / status.active — assessed as acceptable

Teal (`#1F5E5C`, used as the primary chart color) is an exact hex match
for `status.active`, caught during review. Unlike the aqua/info and
yellow/warning collisions, this one is treated as acceptable rather than
something to fix, for two reasons:

1. "Active" isn't an alarm-type semantic the way "warning" or "info"
   are — it's closer to "the normal, expected state," which doesn't
   meaningfully conflict with teal's role as the primary brand color.
2. Category colors are assigned algorithmically to arbitrary categories
   and can collide unpredictably, while teal-as-chart-color is a single
   deliberate choice, not a deterministic mapping — much lower practical
   collision risk.

Confirmed by search: `status.active` and the whole `status.*` family are
currently defined in the token file but consumed nowhere in the
codebase — zero references. So this overlap is presently theoretical,
not live. If `status.active` ever does get consumed by a real UI element
(e.g. a membership status badge on Household, a decision-state
indicator), this assessment should be revisited then — the "acceptable"
call above was made partly on low practical risk, and that risk profile
changes once the token is actually rendered somewhere.

### Multi-line charts — resolved (money in / money out / difference, Year at a glance)

The pattern above was written for a single primary line and didn't
address what a second or third simultaneous data series should look
like — confirmed a real gap, not an oversight to infer around, when
Year at a glance's actual chart (three concurrent lines: money in,
money out, difference) needed an answer this section didn't provide.

**Resolution: one accent, stepped by opacity, not three separate
colors.** The primary line (money in) uses full-strength teal
(`#1F5E5C`); the second line (money out) uses teal at ~60% opacity; the
third (difference) uses teal at ~25% opacity — the same three-step scale
already established on Budget's composition bar, reused here rather
than inventing a second scheme. Achieve every step via opacity on the
core teal value directly (e.g. Tailwind's `/60`, `/25` modifiers), same
discipline as the projected/estimated-segment rule above — never by
reaching for `cfo.light`/`brand.aqua` or any other separately named
token. **A legend labeling each line by name is required whenever more
than one line shares the same hue** — same-hue lines aren't reliably
distinguishable by color alone without one.

**Hibiscus stays reserved exclusively for point-in-time markers** (e.g.
"now" on a forecast line) **and must never be used for a second or
third trend line.** This was implicit in the original pattern's wording
("a genuinely neutral point-in-time reference") but is now explicit,
since the multi-line question could otherwise be misread as making
hibiscus available as a default second-line color.

This resolution is the one to inherit for Money Map's "In" sparkline and
Assets & debts' net worth trend when either becomes a genuinely
multi-line chart — settled here once, not re-decided per page.

---

## 6. Contextual tips

This is a cross-cutting UI pattern used across many pages, same
treatment as chart grammar (§5) — one definition, referenced everywhere
it's used, rather than each page re-deciding the interaction
independently.

### Why this exists

The app's core discipline is plain language over dumbed-down language —
"a dumbed-down interface is right, dumbed-down language insults the
doctor and the single parent alike." That means genuinely technical or
product-specific terms (safe to spend, typical month, purpose types)
stay in the interface as-is rather than being watered down — but they
need a lightweight, optional way to be explained for anyone who wants
it, without cluttering the page for anyone who doesn't.

### The pattern

- **A small, muted info icon** (`ti-info-circle` or equivalent, ~14-16px,
  `text-muted` color) placed immediately after the term it explains —
  inline, not a separate element pulling focus.
- **Tap to reveal, inline — not a tooltip, not a modal.** Tapping
  expands a short explanation directly beneath or beside the term,
  using the same expand/collapse motion timing already defined
  (~200-250ms ease, §4). Tap again (or tap elsewhere) to collapse.
  Modals interrupt; hover-only tooltips don't work on touch devices,
  which this app needs to support — inline expand is the only pattern
  that works consistently across both.
- **Content: 1-2 sentences maximum, plain language, no jargon explaining
  jargon.** Same voice as every other sentence in the app — direct,
  warm, not condescending. A tiny concrete example is fine where it
  genuinely clarifies; padding for length is not.
- **Restraint is the actual discipline here, not the icon itself.** Not
  every technical-sounding word needs a tip — only genuine product-
  specific jargon a first-time user couldn't reasonably infer from
  context. Over-tagging common words with info icons creates visual
  clutter and trains people to ignore the icon entirely.

### Initial terms worth covering (starting list, not exhaustive)

- **Safe to spend** (Money Map) — what's netted out and why.
- **Typical month** (Budget, Money Map) — observed pattern vs. chosen
  plan, the distinction this session spent real effort establishing.
- **Projected available cash** (Year at a glance) — what feeds the
  dashed line, briefly; full detail stays in the page's own scope
  sentence, this tip is the one-line version.
- **Purpose types — build toward / maintain / pay by date** (Goals) —
  why a reserve doesn't get a ring but a savings goal does.
- **Allocation / earmarked** (Goals, Accounts) — why some account
  balance isn't counted as flexible.
- **Planned cost vs. Bill** (Bills, Goals) — the distinction resolved
  this session: paid from cash flow when due, vs. actively saved toward
  in advance.
- **Confidence tags — Confirmed / Expected recurring / Variable
  estimate** (Income) — why these aren't a quality grade, just a
  certainty distinction.
- **Included/excluded** (Accounts) — what this toggle actually controls
  downstream (cash today, safe-to-spend).

### Non-goals

- Not a replacement for plain-language writing elsewhere — this is a
  supplement for genuinely technical terms, not a crutch that lets
  copy get lazier because "there's a tip icon for that."
- No forced tour or sequenced walkthrough of tips — every tip is
  independently discoverable, none are pushed or required reading.
- No modal takeover, no page navigation away from where the term
  appears.
- Not applied to common words — restraint is part of the pattern, not
  an afterthought.

---

## Summary — what this doc resolves vs. leaves open

**Resolved / ready to implement:**
- Category palette (8 new hex values, fully disjoint from existing tokens)
- Category-to-color mapping needs to be deterministic (implementation note)
- Tabular numerals should live in a shared `<Money>` component, not be
  applied per-screen
- Motion rules (fill/count-up/expand timing), no new dependency needed yet
- `prefers-reduced-motion` as a baseline requirement

**Explicitly parked:**
- Full dark mode implementation (post-beta)

**Still open, needs your decision:**
- System font stack vs. a branded custom typeface
- Final sign-off on the 8 proposed category hex values (first pass, not
  final)
