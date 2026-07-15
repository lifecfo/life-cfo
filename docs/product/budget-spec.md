# Budget — page spec (handoff, v3)

Design-stage output. Supersedes any earlier saved version of this spec —
if a prior budget-spec.md exists in docs/product, replace it with this
content rather than saving alongside it. (Worth checking first — this
page's spec may not have actually been saved to the repo yet in an
earlier session; if it isn't there, just save this fresh.)

Build to this, not to what may currently exist in the repo.

## Its one job

The monthly plan the household has explicitly chosen — what income is
expected, what's planned for regular needs, what's likely left. NOT the
typical month. Typical is observed behavior; planned is a chosen
intention. See docs/product/forecast-balance-semantics.md for the
precedence rule governing how "planned" and "typical" relate — this page
doesn't restate that logic, it just needs to respect it: Budget's own
planned amounts also feed Year at a glance's forecast for any category
without a confirmed bill, so this page is now load-bearing for another
page's numbers, not just its own display.

Explicitly NOT this page's job:
- The household-wide "what actually happened" story (→ Money Map)
- Detecting or managing recurring bills/income (→ Bills / Income)
- Any performance verdict — "over budget," "behind," "failing," "at
  risk," "overspent" are banned words on this page, full stop. "On
  track" only if tied to a factual target with a defined path.

## Visual system (references docs/product/visual-design-system.md)

This page should be visually rich — it's one of the pages people actually
explore, not a check-and-leave page like Home. Don't hold back toward
typography-only austerity here.

- **Composition bar (new in v3):** a single wide segmented bar at the top
  of the page, above the three-number summary, showing the whole month's
  plan by group — Essentials, Flexible & lifestyle, Goals & planned
  costs, Unallocated. Same visual language as Money Map's "Out"
  breakdown, reused deliberately for consistency — someone who
  understands one immediately reads the other. Animates fill from zero
  on load (~700ms ease-out), respects `prefers-reduced-motion`.
- **Category colors:** the real 8-slot palette (Juniper `#3E7C74`, Ochre
  `#C98A3E`, Terracotta `#C1614B`, Plum `#7A4B73`, Slate `#5C6F8A`, Sage
  `#7C9070`, Dusty rose `#B4707E`, Sand `#B8A47C`), assigned via the
  deterministic mapping function — never the semantic/status tokens.
  (Early mockups of this page used placeholder success/warning tokens
  before the real palette existed — that was a mistake by the exact rule
  this doc itself sets out; don't carry it into implementation.)
- **Type:** planned amount at Stat-number weight per category row (the
  household's own chosen figure is the headline of its row). Tabular
  numerals throughout via the shared `<Money>` component.

## Layout

### 1. Composition bar + summary header
- Segmented bar (see above), small color-keyed legend beneath showing
  each group's total.
- Beneath that: three numbers, plain typography — Income planned →
  Planned spend → Left unallocated.
- **If "left unallocated" goes negative:** a plain stated sentence, not a
  silently negative number — "The plan currently adds up to $340 more
  than expected income. Something will need to shift."

### 2. Grouped category list
Three groups: Essentials, Flexible & lifestyle, Goals & planned costs.
Collapsed by default with one honest summary line each ("nothing unusual
this month" is a complete, valid state) — expand to see individual
category rows. Default open/closed state per group is a judgment call
(Flexible & lifestyle open by default in the current mockup, reasoning:
that's where day-to-day decisions actually happen) — confirm before
build, not fixed by default assumption.

Each category row, when expanded:
- Icon (category-palette color) + name + planned amount (primary,
  largest weight on the row).
- Filled proportional bar beneath, category's own color, width =
  seen-so-far as a proportion of planned. **If seen-so-far exceeds
  planned, the bar continues past the container edge, same color, no
  color change, no warning state** — validated in design review, colored
  fill bars read as useful/familiar without needing a status change to
  convey it.
- "$X seen so far," muted, beneath the bar.
- Comparison sentence only where genuinely notable against the category's
  own typical pattern — most categories carry no sentence at all.

### 3. Goals & planned costs row
Summary line only ("$400 planned this month — see Goals"), links out.
Does not duplicate Goals' own management UI inline.

### 4. Unallocated card
Distinct dashed-border treatment, friendly framing when positive ("Free
to allocate, or leave as a buffer for the month") — not a warning, not
empty space to feel guilty about.

### 5. Ask input
Anchored, same component as every other page.

## Color rule — critical, unchanged from v2

Category colors must come from the dedicated palette in
visual-design-system.md, structurally decoupled from semantic/status
tokens. This is the single most important implementation note on this
page — the whole point of the bar redesign was proving color can be
useful without being a verdict, and that only holds if the color source
is structurally incapable of drifting into status semantics.

## Empty / no-plan-yet state

Offered, never imposed: "You haven't set a plan yet — I can suggest one
based on your usual months, or you can start from scratch." Typical-month
baseline is a legitimate starting point but must be actively accepted,
never silently pre-filled.

## Explicit scope call for beta

Monthly periods only, no custom/flexible budget periods.

## Dependency

Budget's planned-vs-typical comparisons must read from the shared
"typical month" baseline helper defined in forecast-balance-semantics.md
— never a separately computed value.
