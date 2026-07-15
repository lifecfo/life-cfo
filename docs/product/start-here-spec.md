# Start here — page spec (handoff, v2)

Design-stage output. Supersedes the current live behavior of
`/money/setup`, not a from-scratch page — same route, redesigned
content and interaction model. This page is now load-bearing: per the
FinePrintClient routing change landed this session, it's the effective
landing page for any user without usable data yet (checked via
`setup_status.usable_now` on every sign-in, not a one-time flag) — not
just a rarely-visited nav item.

## Its one job

A gentle, optional guide to the handful of things that would make Life
CFO more useful right now. Never a requirement, never tracked, never
scored — even though it's now often the first real screen someone sees.

## What's actually changing from the current live version, and why

The current version has the exact shape this app has rejected
everywhere else: status pills, a permanent "Already helping" completion
bucket, items that never disappear once satisfied. That's structurally
close to the Monarch-style onboarding checklist explicitly flagged as an
anti-pattern earlier in this project's design work — a completion-
tracking mechanic, just without a progress bar. Fixing it:

- No status pills ("Done," "Worth checking," "Ready," "Not needed
  yet"). Replaced with plain factual sentences, same voice as every
  other page — describing, not grading.
- Satisfied items disappear entirely, not move to a "done" bucket.
  Once an account exists, "add your money" simply stops appearing. No
  counter, no "3 of 4 complete," nothing to feel good about finishing.
- "Ask a question" is not a checklist item. It becomes the anchored
  ask input, same component every other page has — asking isn't
  something to complete, it's always available.
- "Check your bills" and "Add bill dates" consolidate into one item.
  A bill without a date isn't meaningfully "added" per the Bills page
  spec (cadence and due date are core fields there, not optional
  add-ons) — treating them as two separate checklist steps was
  inconsistent with how Bills actually works now.

## Item list (down from six to four, plus the anchored ask)

1. **Connect or add an account** — shown while nothing is connected.
   Links to `/money/import` or `/connections` (confirm which is the
   better default target).
2. **Add your income** — shown while no income sources exist. Links to
   `/money/in`.
3. **Add your bills, including dates** — shown while no bills exist.
   Links to `/money/out`.
4. **Add a goal** — shown while no goals exist. Links to Goals.

Note on items 2 and 3's destinations: these link to the current live
`/money/in` and `/money/out` pages, confirmed still real and functional
this session — NOT to Money Map, which doesn't have this content built
yet despite its spec calling for it. See
docs/product/money-in-out-fold-decision-needed.md — if that gets
resolved and these routes change, this page's links need to be updated
to match, but don't route to a spec instead of a working page in the
meantime.

## Curation rule

Only show items not yet satisfied — same discipline as Home's dots, Money
Map's sentences, everywhere else. If everything is set up, show one
quiet, factual line instead of an empty list or a celebration: "Everything
here is set up. If anything changes, we'll let you know." No "you're all
set!" cheerfulness — that would be performed positivity, not the plain
factual tone the rest of the app holds to.

## Visual system

Plain, text-forward — same register as Household/Bills/Income, not a
data page. Small neutral icon per item (not the category palette — these
aren't spending categories). Chevron affordance per row, tap through to
the relevant page.

## Layout

1. Short intro line: "A few things that could help, whenever you're
   ready." Same warm, unhurried register as Family & pets' "Add a couple
   of names whenever you're ready."
2. List of currently-unsatisfied items (0-4 rows).
3. Anchored ask input: "Or just ask a question — nothing here has to
   come first."

## What a person can do

Tap through to any relevant page. Ask a question directly. Leave without
doing anything — this page imposes nothing, it's still fully optional
even though it's now often the first thing seen.

## Non-goals

- No progress bar, completion percentage, or counter of any kind.
- No permanent "completed items" section — satisfied items simply stop
  appearing.
- No status-pill vocabulary anywhere ("Done," "Ready," "Worth checking").
- No blocking behavior — the full nav remains accessible the entire
  time; this is a suggested starting point, not a gate. This distinction
  is what keeps the new landing-page behavior consistent with the rest
  of the app's philosophy rather than becoming the one place that forces
  completion before entry.

## Dependency

Routing behavior (when this page is shown instead of Home) is handled in
FinePrintClient.tsx, checking `setup_status.usable_now` — already
implemented this session. This spec covers the page's own content and
interaction model, not the routing logic itself.
