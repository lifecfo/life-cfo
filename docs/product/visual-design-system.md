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
