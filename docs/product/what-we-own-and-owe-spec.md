# What we own and owe — page spec (handoff, v2 — full reconciliation)

Design-stage output. Supersedes v1 entirely. v1 was never checked
against live code — worse than stale, one of its central architectural
claims was never true at any point. This document is that
reconciliation, done fresh via direct read of `/net-worth`,
`/liabilities`, and `/investments`, same discipline as Money Map's,
Budget's, and Year's own reconciliations.

## Resolved: three separate pages stay separate — the spec's single
merged page was never built, and shouldn't be forced now

v1 describes one page — a hero net-worth number, a two-segment
composition bar, a historical trend line, unified "Owned"/"Owed"
groups, one Ask input. Live reality is three genuinely independent
routes (`/net-worth`, `/liabilities`, `/investments`), each with its
own data-loading, and two of the three (Liabilities, Investments) with
real, substantial CRUD and functionality that grew independently of any
merged design.

**Resolution: keep three pages.** Same reasoning as Money Map and
Year — real, working functionality (Liabilities' full archive/restore/
delete lifecycle; Investments' realtime sync, search, kind taxonomy,
Valued/Unvalued badges) would be discarded to chase a design that was
never built and was never checked against what these pages actually
grew into. `/net-worth` remains the aggregate summary view; Liabilities
and Investments remain their own real management pages — the same
"summary links to real management page" relationship Bills already has
with Money Map.

## Resolved: the "shared calculation" claim was never true — corrected,
not just updated

v1's Cross-reference section states: *"Net worth is a shared calculation
per page-ownership-map.md's canonical concepts table — this page
presents it, doesn't independently recompute it."* Confirmed false, not
merely outdated: `/net-worth` has always computed its own net-worth
figure standalone, client-side, from three raw Supabase queries. No
shared calculation is called from anywhere. This isn't drift from a
past-accurate description — the claim never described reality.

**The real, correct methodology, as it exists today** (following this
session's earlier fix): Assets = `cash`/`investment`-type accounts, plus
`investment_accounts`, summed per currency. Liabilities = `credit`/
`loan`-type accounts (using `Math.abs()` on their already-negative
balances), plus the `liabilities` table, summed per currency. Accounts
with `type === "other"` are excluded from both sides entirely. This is
now documented correctly in the live page's own explanatory sentence —
worth reusing that exact wording here as the canonical description,
since it's already accurate and already shipped:

> "Assets are cash and investment accounts, plus your Investments list.
> Liabilities are credit and loan accounts, plus your Liabilities list.
> Accounts marked 'other' aren't included on either side."

## Real bug found this session — not a style inconsistency, an accuracy
defect

Three pages, three independently-written money formatters, none
shared, none `<Money>`:

- `/net-worth`: local `fmtMoneyFromCents()`.
- `/liabilities`: a separately-duplicated near-identical local
  `fmtMoneyFromCents()` — not imported from `/net-worth`'s or anywhere
  shared, despite the near-identical implementation.
- `/investments`: local `money()`, with **two real bugs**, not one —
  hardcoded `"en-AU"` locale (same category of issue Budget had before
  this session's fix) **and `maximumFractionDigits: 0`, which silently
  drops cents on every dollar figure on this page.** An investment
  worth $45,678.90 displays as $45,679 — a real, live accuracy loss on
  a page showing people's actual financial holdings, not a cosmetic gap.

**This is the fourth instance of the same duplication pattern found
this session** (account classification, cash-total/year-summary,
Budget's local formatter) — worth treating as a known, recurring habit
in this codebase to check for on every future page audit, not a
one-off surprise each time.

## Real, working sections with no spec equivalent — kept, not rebuilt

- **Liabilities' full lifecycle**: add, inline edit, archive/restore,
  delete (with confirmation) — none of this described in v1 at all.
- **Investments' realtime sync** (Live/Offline/Connecting), search,
  kind taxonomy (brokerage/super/crypto/property/other),
  Valued/Unvalued badges, top-5-then-show-all pagination — real,
  substantial functionality with no spec equivalent whatsoever.

Neither needs redesigning. Both need the same visual-polish pass
(`<Money>`, motion) as everything else, once that work happens.

## Real gaps, sized honestly

**Tier 1 — the formatter bug, real and urgent:** migrate all three
pages to `<Money>`, which resolves the duplication *and* the
dropped-cents defect on Investments in the same change. Drop the
hardcoded locale on Investments' formatter the same way Budget's was
dropped, matching runtime-default-locale behavior used everywhere else.

**Tier 2 — visual polish, straightforward, not blocked on anything:**
motion (`useCountUp` on the summary figures, `.motion-fill` on any bar
elements once they exist) — currently zero motion anywhere across all
three pages.

**Tier 3 — genuinely new features, real future work, not attempted
now:**
- Property/vehicle valuations and debt terms (interest rate, minimum
  payments) — v1 calls for these on Liabilities; neither exists in the
  live schema or UI today. Real scope, needs its own design pass.
- Verified/Estimated certainty tiers with staleness disclosure — v1
  calls for this; doesn't exist live. Same shape as Income's
  `confidence_tier` work — a real schema-plus-UI feature, not a quick
  addition.
- The hero number / composition bar / trend line visual redesign of
  `/net-worth` itself — v1's original vision for this page's *look*
  remains a legitimate future direction, but shouldn't be attempted
  until the underlying architecture question (three pages, not one) is
  settled here, which this reconciliation now does. Worth its own pass,
  same as Home's still-unbuilt design.

## Non-goals, reconfirmed

No merge of the three pages into one. No color-as-verdict on Liabilities
or Investments (unaudited for this specifically — worth a quick check
during the Tier 1/2 pass, same as every other page's risk-color
scrutiny this session).

## Summary of what this reconciliation resolves

1. Architecture — settled. Three pages stay three pages; the spec's
   false "shared calculation" claim is corrected to describe what's
   actually built.
2. The real net-worth methodology — documented accurately for the first
   time, reusing the live page's own already-correct explanatory
   sentence as the canonical wording.
3. A real, live accuracy bug (dropped cents on Investments) — flagged
   as Tier 1, fixed as a natural consequence of the `<Money>` migration
   already planned for every page.
4. Two pages' real, substantial functionality — documented as real and
   staying, same treatment as Money Map's and Year's own real sections.
5. Two genuinely new features (valuations/debt terms, certainty tiers)
   — sized honestly as Tier 3, not conflated with the visual-polish
   work that can happen now.
