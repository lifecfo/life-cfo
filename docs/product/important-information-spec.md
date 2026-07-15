# Important information — page spec (handoff, v1)

> **SUPERSEDED — do not build a new page from this spec.** This page
> already exists in the codebase at `/fine-print` (component:
> `ImportantInformationContent.tsx`), titled "Important information."
> Confirmed by direct code read. Kept here as a record only.
>
> Its one surviving useful note: the existing "not financial advice"
> section (currently "What Life CFO does not do") is a plain paragraph,
> the same visual weight as the other five sections. It should get more
> visual prominence — bold callout treatment, and consider moving it
> earlier — than its current plain-paragraph treatment.

Design-stage output, first full version. Mostly an assembly job, not a
from-scratch draft — the content below draws directly from
docs/product/trust-model.md and docs/product/how-life-cfo-works.md,
which are already written in the right voice: plain and confident, not
lawyer-speak dressed up as friendliness.

Build to this, not to what may currently exist in the repo.

## Its one job

State plainly what Life CFO is, what it can and can't see, what it will
never do, and — unambiguously — that this is not financial advice.
Distinct from Privacy (data handling specifics: what's collected, how
it's shared, retention) and How Life CFO works (the functional explainer
of how answers get produced). This page is the trust/disclaimer primer;
those two pages are not restated here, just referenced.

## The financial-advice disclaimer needs real prominence, not just presence

Near the top of the page, short, bolded, impossible to skim past:

> **Life CFO is a decision-support tool, not a licensed financial
> adviser. Nothing in this app is personal financial advice.**

This is a direct, minor rewording of the line already sitting in
life-cfo-philosophy.md ("Life CFO is not financial advice.") — it just
needs to be surfaced here explicitly, in the app, rather than living only
in an internal product doc nobody using the app ever sees.

## Content (assembled from existing docs, not redrafted from scratch)

### What Life CFO can see
Pulled directly from how-life-cfo-works.md's "What Life CFO can see":
- connected account information
- balances
- transactions
- financial connections
- saved goals
- saved decisions
- notes or questions entered by the user

### What Life CFO cannot see
Pulled directly from how-life-cfo-works.md's "What Life CFO cannot see":
- bank passwords
- bank login credentials
- emails
- messages
- activity outside the app
- information the user has not provided or connected

### What Life CFO will never do
Combines how-life-cfo-works.md's "What Life CFO is not designed to do"
and trust-model.md's "No hidden autonomy" commitment — same list, said
once, plainly:
- move money
- make payments
- initiate transfers
- act autonomously on financial accounts
- make decisions for the user
- change important stored state without explicit user action

### The financial-advice disclaimer
Restated here in full at normal reading position (not just the bolded
callout above), so the page reads as complete on its own without relying
solely on the top-of-page callout:

> Life CFO provides financial analysis, scenario exploration, and
> decision support. It does not provide personal financial advice, and it
> is not a substitute for a licensed financial adviser, accountant, or
> legal professional. Decisions remain the household's to make.

## Where the disclaimer needs to show up beyond this page

Worth deciding deliberately, not by default:
- **A one-time acknowledgment at onboarding** — not a recurring
  interruption.
- **A light, permanent link from Settings and from Ask itself.**

Not full disclaimer text repeated everywhere — that would be exactly the
kind of clutter/pressure trust-model.md argues against (see its "Product
trust test": reject anything that "increases cognitive load" or "creates
pressure to engage"). Just an always-available, never-forced path back to
this one page.

**Open question, not resolved here:** the app already has a `/fine-print`
page implementing a one-time legal-acceptance flow (signed name, version,
accepted-at timestamp) — the onboarding acknowledgment described above
may already belong there, or this page may need to become what Fine
print's acceptance flow points to and records agreement against, rather
than a fourth destination competing with Privacy, How Life CFO works, and
Fine print. This spec doesn't resolve which; flagging so it isn't
silently decided by whoever implements it first.

## Visual system

Plain, text-forward — same register as Settings. This is a reading page,
not a data page: no category palette, no charts, no rings, no
tabular-numeral concerns (no monetary figures live here).

## Layout

1. Bolded disclaimer callout (see above), near the top.
2. What Life CFO can see.
3. What Life CFO cannot see.
4. What Life CFO will never do.
5. The disclaimer, restated in full.
6. Links: Privacy Policy, How Life CFO works (cross-references, not
   duplicated content).

## Non-goals

- No data-handling specifics (retention, third-party sharing, security)
  — that content stays on Privacy, not duplicated here.
- No functional/mechanical explanation of how answers are produced —
  that content stays on How Life CFO works.
- No repeated full-disclaimer text scattered across other pages — one
  page, linked from a few places, per the "where it needs to show up"
  section above.

## Empty state

Not applicable — this is static content, not data-driven.
