# Goals — page spec (handoff, v1)

Design-stage output. First full version of this spec — the underlying
Goal/Planned cost/Allocation model was resolved in an earlier session
(see page-ownership-map.md) but never laid out as a full page design
until now.

Build to this, not to what may currently exist in the repo.

## Its one job

Household aims — both desired future outcomes (Goals) and known future
expenses the household is setting money aside for (Planned costs). Owns
creation, management, and full detail for both. Allocation is the
invisible mechanism linking cash to either — not its own visible product
surface.

**Resolved (previously open in page-ownership-map.md):** Planned costs
is a section within this page, not a separate nav-level page. No evidence
justifies splitting it, and splitting it would recreate the exact
"two competing places for money-set-aside" problem this model was built
to resolve.

Explicitly NOT this page's job:
- The short summary version (→ Money Map's goals snapshot and Budget's
  "Goals & planned costs" row both link here; neither duplicates this
  page's detail)
- Deciding safe-to-spend or projected available cash — this page
  contributes allocation data to those calculations, per
  forecast-balance-semantics.md, it doesn't compute them itself.

## Cross-reference — read before building the allocation logic

Per forecast-balance-semantics.md: allocations reduce *flexible* cash but
don't change *total* cash — both figures may need to coexist depending on
where they're shown. A goal contribution affects flexible cash if it
represents a genuine intended commitment, not if it's merely an internal
transfer with no behavioral commitment behind it. Do not re-derive this
logic here; reference the canonical doc.

## Visual system (references docs/product/visual-design-system.md)

- **Purpose type determines the visual, not just a label:**
  - "Build toward" and "pay by date" goals/planned costs have a real
    finish line → get a **progress ring**. This is a deliberate, first
    real use of the ring pattern shelved during Budget's design — Budget
    has too many categories at once for rings to stay calm, but a
    household's goals are few enough that rings work here without
    becoming a fitness-app wall.
  - "Maintain" goals (a buffer, an emergency reserve) have no finish line
    → get a **plain bar**, not a ring. Using a ring here would visually
    imply completion for something that's never meant to complete.
  - A planned cost with **no allocation yet** gets neither ring nor bar —
    plain amount + due date, muted, dashed card border, "not yet being
    saved for." A ring at 0% reads as a failing goal; an unstarted state
    should look genuinely different from a struggling one.
- **Category colors:** real palette, deterministic mapping, same rule as
  every other page.
- **Motion:** rings and bars fill/draw on load (~700-800ms ease-out),
  respecting `prefers-reduced-motion`.
- **Milestone moments:** hitting a real target or meaningful checkpoint
  gets genuine, understated visual delight — per the product principle
  "journey as honest progress: real movement, marked because it's true."
  Never manufactured, never tied to engagement frequency, never on a
  schedule — earned by an actual milestone only.

## Layout

### 1. Header
One hero number — total currently set aside across everything on this
page — plus one plain sentence stating the count ("across 2 goals and 2
planned costs"). Same typographic language as Money Map's hero; not a new
pattern invented for this page.

### 2. Goals group
Grid of cards. Each: icon (category color), name, ring or bar per purpose
type above, current/target amounts (tabular numerals), plain-language
status sentence — **shown only when genuinely notable**, using
observational language only: "ahead of schedule," "contributing less
than planned," "progress has slowed." **"Behind" is banned here, same
fix already applied to Money Map's goals snapshot** — this was an
inconsistency to correct, not a new rule invented for this page.

### 3. Planned costs group
Same card shape as Goals. Shows due date instead of (or alongside)
target-amount framing where relevant. Unallocated items get the muted,
dashed, ring-less treatment described above.

### 4. Ask input
Anchored, same component as every other page.

## What a person can do

- Create/edit a goal or planned cost, including setting its purpose type
  (build toward / maintain / pay by date).
- Adjust target amount or date.
- Link or adjust an allocation (which account, how much).
- Ask about any item — conversation pulls in relevant Money Map/Budget
  context rather than requiring the person to go find it.

## Curation rule

Same discipline as every other page: a status sentence appears only when
genuinely notable against that item's own expected pace. A goal that's
simply proceeding as expected carries no sentence at all — quiet is a
complete, valid state.

## Non-goals

- No gamification — no streaks, badges, or completion counts tied to
  check-in frequency. Milestone delight (above) is earned by real
  progress, never by engagement.
- No comparison or ranking between goals ("your top goal," leaderboard-
  style framing).
- No implied competition between household members who contribute to a
  shared goal.
- No red/green or any performance-coded color — purpose type changes the
  *shape* (ring vs. bar vs. plain), never color-as-verdict.

## Empty state

Warm, offered invitation — "You haven't set up any goals or planned costs
yet." A few example starting points as quick-start options (a holiday, an
emergency reserve, a known upcoming cost like rego or school fees) —
mirrors Home's empty-state pattern of offering rather than imposing.
