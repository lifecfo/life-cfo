# Home — page spec (handoff, v1 — first full reconciliation)

Design-stage output. No prior spec doc exists for this page — confirmed
via a check of all 33 files in `docs/product/`. This document is the
first, written after a fresh audit against live
`app/(app)/lifecfo-home/page.tsx`, same discipline as the five other
pages reconciled this session.

## The honest starting point: the early-session design work was never
built

Early in this project, real design work was done for this page — a
gradient background, a breathing animated spiral mark, curated "dots,"
a values-reflection mechanism reflecting a person's own stated reasons
back to them. Confirmed via direct, fresh grep of the live file: none
of it exists, in any form, anywhere. Not partial, not renamed — never
implemented. Worth stating plainly rather than treating this page as
"needs polish" the way the other five did; visually, Home is starting
from zero.

## Resolved: two hidden, fully-working sections — one deleted, one
content folded into what's already visible

Confirmed via `git log`/`git blame`: on 2026-07-02, in the same commit
that introduced today's "Your money picture" and "Coming up" cards, two
older cards — a "check-in memo" and "What matters now" — were switched
to `hidden` in that same diff, with no explanation recorded, and never
touched again since. Read together, this was a deliberate
redesign-and-supersede at the time, not an accident or a stray flag —
just never followed through to actual removal or content migration.

**"What matters now" — delete entirely.** Confirmed its content is
near-fully subsumed by "Coming up" already (same source list,
overlapping items, one literally pulled from the other today). Reviving
it would recreate exactly the kind of duplicate-priority-list problem
this session has worked to eliminate elsewhere, just at the UI layer.
Nothing here is worth keeping as its own section.

**The check-in memo — delete the card, but keep two real pieces of
content by folding them into "Your money picture."** Most of its
content (money in/out, available cash) already duplicates the visible
hero card. But two things are genuinely unique and currently shown
nowhere else on this page: **which data source(s) are feeding the
picture**, and **confirmed-pattern counts** (regular payments / income
patterns already recognized). Confirmed via direct trace: both are
already fully populated in this page's existing `data_coverage` state
(fed by the same `/api/money/overview` call already loading everything
else here) — no new fetch required, same category as Money Map's trust
footer built earlier this session.

## Real scope for this page, given the above

1. **Delete "What matters now"** — the card, its underlying
   `whatMattersNow` render block, and the now-dead `hidden` class. Clean
   removal, not a hide-deeper.
2. **Delete the check-in memo card**, but first extract its
   source-name (`sourceNames()`/`visibleMoneySummary()`) and
   confirmed-pattern-count content into a small addition on "Your money
   picture" — a quiet, trust-footer-style line, not a second hero.
3. **Design-system migration** — `<Money>` for every dollar figure
   (currently all plain `formatMoneyFromCents()` calls, correctly
   importing the shared formatter, just not wrapped), motion
   (`useCountUp` on the hero figure and summary amounts, `.motion-fill`
   on the two existing static progress-style bars — the allocation bar
   and the goals bar), same pattern as every other page this session.
4. **The never-built early design work** — gradient, spiral mark, dots,
   values-reflection — stays explicitly out of scope for this pass.
   That's a genuine from-scratch design project, not a "finish the
   polish" task like the rest of this page's work. Worth its own
   deliberate design session, not folded into a mechanical migration
   pass.

## Real follow-up, found while executing the Tier 3 migration: 5 call
sites don't migrate mechanically

`<Money>` migration and motion were applied to every directly-rendered
dollar figure on this page. Five `formatMoneyFromCents()` call sites
remain unmigrated, and it's not an oversight: they're baked into
`HomeNowItem.title`/`.detail` string fields (feeding the
`whatMattersNow`/`comingUpItems` computations), resolved to plain text
before the value ever reaches JSX — a `<Money>` element can't be
embedded inside an already-resolved string. Converting these requires
changing those fields from `string` to `ReactNode`, a real structural
change touching two `useMemo` computations and the "Coming up" card's
render, not a mechanical formatter swap. Flagged as a real follow-up,
not attempted in this pass.

## Non-goals for this pass

- No revival of "What matters now" in any form.
- No rebuild of the gradient/spiral/dots/values-reflection concept —
  explicitly deferred, not attempted here.
- No new data fetching — everything in scope is already-loaded state,
  same discipline as Money Map's trust footer.

## Summary of what this reconciliation resolves

1. Confirms, plainly, that Home's early ambitious design was never
   built — sets honest expectations rather than treating this as a
   quick polish pass.
2. Two five-week-old hidden sections resolved with real reasoning, not
   left as unexplained dead code — one deleted outright, one's real
   content preserved by folding into the live card.
3. Scopes the actual visual-polish work (Money, motion) the same way
   every other page's Tier 2 work was scoped.
4. Explicitly separates "finish this page's polish" from "design Home's
   real visual identity" — the latter deferred on purpose, not silently
   dropped.
