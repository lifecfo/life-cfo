# Money Map — page spec (handoff, v4 — full reconciliation)

Design-stage output. Supersedes v3 entirely. This version is the product
of a full reconciliation against the live page's actual six sections
(Where the money is, Cash Plan, Savings goals, What is already planned,
What is coming up, What needs review) per
docs/product/regression-risk-audit.md — not a redesign from a blank page.
Most resolutions here apply decisions already made elsewhere this
session rather than inventing new ones; where that's true, it's cited
explicitly below.

Build to this. If this conflicts with docs/product/money-map-spec.md
(v2/v3), this file wins.

## Its one job — unchanged

Money Map is the canonical visual representation of the household's
current financial position. Every other page either contributes data to
it, explains part of it, or explores changes to it. The complete,
honest, present-tense picture — for anyone who wants to look rather than
ask.

## Section order (fixed)

### 1. Safe to spend (hero) + Cash today (secondary)
Unchanged from v3: hero number, confident label, honesty in the caption
beneath it, "ask why" affordance handing to conversation, trust footer
(freshness + scope) near the bottom of the page. See
forecast-balance-semantics.md for the calculation itself — not restated
here.

### 2. Where the money is — already correct on the live page (confirmed
against reality, not a promotion)

**Correction:** earlier drafts of this section described this as being
"promoted" from a secondary number to a real section. Checked directly
against the live page during implementation: "Where the money is" was
already a full section, already positioned directly after the hero and
before Cash Plan. There was nothing to promote and no reorder was made.
The "secondary number" framing described v3's *design-doc* proposal (a
small "Cash today" figure that was never built), not anything the live
code needed to change. Live's per-account breakdown (grouped by
classification, each account showing name, type, source label —
Manual/Plaid/Basiq/Connected — and balance) is genuinely better than
that never-built v3 proposal, and it directly answers a gap flagged
early this session: *"Money Map never explicitly answers where is my
money."* No code change was needed to achieve this — it already does.

**Resolved earlier this session, confirmed via direct code read:** this
section used to classify accounts via its own `accountGroup()` (a regex
on `account.type`) while Cash Plan used a separate `classifyAccount()`
(a type+subtype lookup) — risking the same account classifying
differently in the two places. That duplication no longer exists:
`deriveCashPlan.ts` no longer has its own `classifyAccount()` — it now
imports and calls `deriveMoneyMap.ts`'s `accountGroup()` directly, which
is the single classifier both sections share.

**Visual treatment:** plain, factual — same register as the Accounts
page. No category palette (accounts aren't categories, established
earlier this session). Source labels shown plainly.

### 3. Money in / Money out — unchanged from v3
Two cards. In: stat + sparkline. Out: stat + category-breakdown bar +
driver sentence, shown only when notable. See v3 for full detail — not
repeated here, nothing changed.

### 4. Recent activity — unchanged from v3
Short list, 5-8 items, category-colored icons matching Transactions'
system.

### 5. Goals snapshot — RESOLVED, sourced from the same `money_goals`
table Goals itself uses

**Resolution:** live already reads the same table the Goals page
manages — no new data source needed. Two fixes:
- Replace the hardcoded "Tracked separately" status label with real
  observational language per the curation rule already established
  ("ahead of schedule," "contributing less than planned," "progress has
  slowed" — never "behind," same fix already applied to this section
  once before and apparently not yet built).
- **Spotlight the primary goal** (`is_primary` already exists in the
  data) — mirrors Goals page's own "Focus" card, so the same concept
  reads consistently in both places rather than Money Map showing an
  undifferentiated list while Goals highlights one goal specially.

Links out to Goals for full detail. Does not duplicate Goals' management
UI.

### 6. Net worth — unchanged from v3
Collapsed, quiet, one line + number. Deliberately unpromoted — see v3
for the full reasoning, still holds.

### 7. Trust footer — unchanged from v3
Freshness + scope, one line.

## What's being cut, and where each piece actually goes

### Cash Plan — cut as a visible card entirely

**This is not a new decision — it's applying one already made.** Early
this session, before Goals existed as a designed page: *"Cash Plan
buckets can therefore become an internal allocation model rather than a
visible standalone product section."* Live Money Map still shows Cash
Plan as its own card with its own jargon ("Account-backed," "Needs
review") — it just hasn't caught up to that decision yet.

**Resolution:** `money_buckets`/`money_bucket_allocations` become the
real backing implementation of Goals' "Allocation" concept (per
goals-spec.md's Goal/Planned-cost/Allocation model) and feed
safe-to-spend's earmarked-cash deduction, per
forecast-balance-semantics.md — invisibly, as plumbing, never as a
user-facing card. The 12 validation reason codes remain real, valuable
data-integrity logic; they stop being shown to users as raw category
labels.

**Real gap found, not resolved here:** the migration creating these
tables explicitly states *"Authenticated writes stay closed until
concurrency-safe RPCs are added"* — there is currently no way for a user
to create a bucket/allocation at all. Goals' spec needs to inherit this
as a real, load-bearing dependency, not something this reconciliation
can solve on its own.

### "What is already planned" — cut, split two ways

- **Scheduled (income + bills)** — cut outright. Redundant with what
  Bills and Income already show on their own pages; this was Money Map
  quietly duplicating content it doesn't own.
- **Confirmed patterns** (`transaction_pattern_confirmations`) —
  relocates to wherever the confirmation needs acting on (Bills/Income).
  **This surfaces a real correction needed elsewhere, not resolved
  here:** both bills-spec.md and income-spec.md describe a "detected/
  confirmed recurring payment lifecycle" as parked and unbuilt, deferred
  to a real-bank-data phase. That's incorrect — the table exists, has
  real RLS policies, and Money Map is actively reading pending
  confirmations from it today. Those two specs' "parked, not built now"
  sections need investigating and correcting as their own task.

### "What is coming up" — cut entirely

Year at a glance already does this job, and per the regression audit,
does it with more sophistication (the curation rule protecting large
infrequent bills from being crowded out by nominally-larger monthly
ones, the "Timing needed" disclosure for un-projectable items). This
card was Money Map duplicating a job Year already owns. Cut; the
existing "View Year at a glance" link becomes the sole handoff for this
kind of content.

### "What needs review" — cut as a standalone card, five items
redistributed to their real owners

This card directly contradicted an existing non-goal (*"No Money-Map-
specific attention feed... considered and rejected during review"*), but
simply deleting it would lose five real, working checks per the
regression audit. Fix: route each to whoever actually owns that concern.

1. **Missing bill/income dates** → a genuine **Home dot** candidate,
   under the existing "requires confirmation because it affects another
   calculation" test (a dateless bill can't feed Year's forecast) — the
   same completeness-gap pattern already designed into Home's v3 spec.
2. **Unlinked goals** → dissolves once Cash Plan becomes Goals'
   allocation layer (see above) — becomes a Goals-page concept.
3. **Pending pattern confirmations** → Bills/Income (see above).
4. **Stale/reference-only sources** → an Accounts-page concern.
5. **Bills exceeding visible cash** → the most significant one. Routes
   into safe-to-spend's own caption sentence when relevant, and/or as a
   Home dot — this is close to a genuine squeeze signal on the hero
   number itself, not a separate review item.

Nothing here is lost. It stops being a fourth attention mechanism
competing with Home's dots and Year's flagged months, and becomes five
things correctly owned by the pages that were always supposed to own
them.

## Summary of new open items surfaced by this reconciliation

1. ~~Account classification duplication~~ — **already resolved earlier
   this session, before this spec was written.** `deriveCashPlan.ts` now
   imports and uses `deriveMoneyMap.ts`'s `accountGroup()` directly,
   confirmed via direct code read. No longer an open item; kept here
   only so this list's history isn't silently rewritten.
2. **Cash Plan has no write capability yet** (RPCs not built) — Goals'
   spec needs to inherit this as a real dependency.
3. **Bills-spec.md and income-spec.md incorrectly describe the detected-
   payment-confirmation lifecycle as unbuilt/parked** — it exists and is
   live via `transaction_pattern_confirmations`. Both specs need
   correcting; this needs its own investigation before those specs can
   be fully trusted.
4. **"Ask why" affordance remains unbuilt — blocked on a real
   prerequisite, not a placement decision.** Confirmed this session: it's
   specifically scoped to the safe-to-spend hero number (Section 1
   above), which doesn't exist anywhere on the live page yet. Building it
   against a different anchor instead (e.g. the account-group subtotals
   in "Where the money is") would contradict `page-ownership-map.md`'s
   own rule on which numbers warrant this treatment — plain factual
   balances are explicitly exempted there ("Doesn't: ... an account
   balance in an account list"). This waits on the hero number itself
   getting built; there is no alternative anchor to pick instead.

None of these block implementing this spec's page-level layout — they're
dependencies for the pieces that reference them (Goals, Home, Bills,
Income), not blockers for Money Map's own reconciliation.
