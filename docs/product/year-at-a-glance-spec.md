# Year at a glance — page spec (handoff, v3 — full reconciliation)

Design-stage output. Supersedes v2 entirely. v2 was explicitly framed as
"build to this, not what currently exists in the repo" and never
actually got reconciled against live code — this document is that
reconciliation, done fresh this session via direct read of
`app/(app)/money/year/page.tsx`, same discipline as Money Map's and
Budget's own v4 passes.

## Its one job — unchanged

What's already known to be coming, and whether any of it creates a
squeeze. Read-only.

## Resolved: the live 3-line chart stays as the page's primary visual —
the spec's tile-strip + single-balance-line design was never built and
isn't being forced in now

The live page has a genuinely different, working visualization from
what v2 described: a per-currency SVG chart plotting monthly money in /
money out / difference, backed by an always-visible "Monthly details"
table — not the spec's 12-month tile strip with a single projected-cash
line.

**Resolution:** keep the live chart. It answers a real, useful, adjacent
question — the shape of income and spending through the year — on its
own terms, not as a placeholder standing in for something else.
Rebuilding toward the spec's original vision right now would mean
discarding real, working functionality to chase a feature that depends
on infrastructure that doesn't exist anywhere in the app yet: a real
running "projected available cash" balance requires the same shared
safe-to-spend / forecast calculation Money Map's own hero number is also
still waiting on (confirmed unbuilt, multiple times, this session).

The single projected-cash line remains a real, legitimate goal — Tier 3,
same size class as Money Map's hero number or Budget's per-item fill
bar. Not attempted in isolation here. When the shared calculation
infrastructure gets built, it likely belongs on both Money Map and Year
at a glance at once — building it twice, independently, on two pages
would just recreate the kind of duplication this session has spent real
effort eliminating elsewhere (cash totals, year summaries, account
classification).

## Real fixes needed — Tier 1, actual code bugs, not documentation gaps

- **The amber (`#a16207`) flagged-month marker is a live violation of
  this page's own explicit non-goal** — "no color beyond a single
  neutral flagged-month marker" — not a spec/reality gap, an active
  contradiction. Confirmed via direct code read: `app/(app)/money/year/page.tsx`
  lines 94-96 (`#059669`/`#3f3f46`/`#0284c7` for the three chart lines)
  and line 105 (`#a16207` for the flagged marker). Needs to become the
  same neutral treatment already correct everywhere else on this page.
  Same category as Budget's risk-color bug found and fixed earlier this
  session — should get the same treatment: its own small, isolated,
  reviewed diff.
- **The scope-disclosure sentence is a single hardcoded string,
  identical for every household**, directly contradicting the spec's
  explicit requirement that it reflect real sources/fallbacks/gaps
  per-household. Before this can be fixed, needs its own investigation:
  does the underlying data (which figures are confirmed vs. estimated
  vs. missing) already exist anywhere in this page's data pipeline, or
  does a real per-household sentence need new logic built first? Not
  assumed either way — flagged as its own scoped question.

## Real, working sections with no spec equivalent — kept, not rebuilt

Same treatment as Money Map's Cash Plan, "What needs review," etc. —
real, valuable, staying exactly as they are, functionally:

- **Money seasons** (heavier/quieter month classification per currency)
- **Larger scheduled payments**
- **Savings goals** (a summary view; full management stays on Goals)
- **Timing needed** (items missing valid recurrence timing — the page's
  own honest "we can't project this yet" signal)

None of these need redesigning. They need the same visual-polish pass
(the `<Money>` migration, motion, chart-grammar colors) as everything
else on this page, once that work happens.

## Real gaps, sized honestly — Tier 2, moderate, not blocked on anything

- **No anchored Ask input exists** — the spec calls for one, it isn't
  built. Straightforward addition, reusing the pattern already
  established on other pages — not a design question, just unbuilt.
- **Dollar-figure formatting is plain text via the shared
  `formatMoneyFromCents`, not yet `<Money>`.** Real structural constraint
  found this session, worth documenting precisely so a future migration
  doesn't get this wrong: several call sites render inside raw SVG
  `<text>`/`<title>` elements (confirmed at lines 101, 110, 111, 112).
  `<Money>` renders a `<span>`, which cannot be used inside SVG text
  nodes at all. A future migration here needs a genuinely mixed
  approach — HTML-rendered call sites (summary cards via `moneyRows()`,
  the details table, larger payments, goals — confirmed at lines 26,
  133-135, 138, 281, 299-300) convert to `<Money>`; SVG-embedded call
  sites stay on the plain string formatter permanently, not as a
  temporary gap to later "finish." Unlike Money Map/Budget/Goals, this
  page cannot have every call site converted uniformly.
- **Chart colors (emerald/zinc/sky for the three lines) haven't adopted
  the chart-grammar palette** (teal/hibiscus, per
  `visual-design-system.md` §5) yet. Real drift from the established
  system, not urgent on its own, worth fixing in the same visual pass as
  the rest of this page's work.
- **Zero motion anywhere on this page** — the one page among those
  touched this session with no `.motion-fill`/`useCountUp` treatment at
  all yet.
- **Tap-to-expand vs. the live always-open details table** — a minor UX
  difference from the original spec, not a functional gap. The live
  table already serves the "see the detail" job; not mandating a change
  here, just noting the difference exists.

## Non-goals, reconfirmed

Unchanged from v2: no daily granularity, no multi-year modeling, no
editing on this page directly (previews/handoffs only), no color beyond
the single neutral flagged-month marker — now something to actually
enforce via the Tier 1 fix above, not just a stated rule with a live
exception sitting right next to it.

## Summary of what this reconciliation resolves

1. **The chart-architecture question — settled.** Live chart stays; the
   spec's single balance line becomes an explicitly deferred future
   project, tied to the same infrastructure Money Map's hero number
   needs.
2. **Amber marker** — real bug, flagged for its own immediate fix.
3. **Scope sentence** — real gap, flagged for its own investigation
   before a fix gets written.
4. **Four sections with no spec equivalent** — kept, documented as real
   and staying, same treatment as Money Map's real sections.
5. **Money/motion/color visual work** — sized, sequenced, and the one
   real structural constraint (SVG text nodes) documented so it doesn't
   get discovered the hard way mid-migration.
