# Household resource visibility — accounts, decisions, and the household
role boundary

Design-stage output. This is the "real household transparency" work the
original product brief explicitly named as unbuilt and deferred —
picked up deliberately this session, not by accident. Cross-cutting,
same treatment as forecast-balance-semantics.md — referenced by
household-spec.md, accounts-spec.md, and Decisions' own documentation,
not restated in each.

## The problem this solves

A household sharing one Life CFO account currently has only one lever:
household role (Owner/Editor/Viewer), which governs *administrative*
power — who can rename the household, invite people, manage members.
It says nothing about whether one partner's individual savings account
should be visible to the other. Today the answer is implicitly "yes, if
they're in the household at all" — there's no way to keep an individual
account private while still sharing the rest of the household's
finances.

Grounded in real research on how the best-regarded couples' finance apps
(Honeydue, HoneyFi) actually solve this, and one deliberate correction
against a competitor's mistake (Monarch's "private" transactions are
documented as still accessible in a hidden folder — not actually
private, just filtered out of the default view).

## The core principle, stated first because everything else follows from
it

**Household role and resource visibility are two separate systems.
Household role must never override resource visibility.** A Viewer must
be able to keep their own personal account private from an Owner. This
isn't a technicality — research on financial abuse specifically
identifies controlling a partner's access to their own financial
information as a recognized abuse pattern. Whoever owns a resource
controls its visibility, full stop, regardless of anyone else's
household role.

## Visibility states — accounts

Three states per account, set by whoever owns that account:

- **Shared** — full detail visible to the household, same as today's
  default behavior.
- **Summary only** — the household sees the aggregate (a balance, a
  contribution to totals) but not the transaction-level detail. This
  maps naturally onto what Money Map already does with aggregated
  figures — no new display concept needed, just a real access boundary
  behind it.
- **Private** — nothing visible to anyone else in the household. Must
  be enforced at the database layer (RLS), not filtered in the UI. This
  is the direct fix for Monarch's documented failure — a "private"
  setting that's actually just a client-side filter is not private, it's
  a broken promise. Given RLS already governs every table in this app,
  doing this correctly is a real, achievable bar, not aspirational.

## Default, to avoid adding a decision-fatigue moment

When an account is connected, one simple question at that point — joint
or individual? — sets a sensible default (joint → Shared, individual →
Private) rather than forcing a separate visibility decision on top of
everything else already asked during connection. The person can change
it later; this just avoids making privacy configuration its own extra
step for every account.

## Changing visibility after the fact: Shared → Private

**Resolution: the cutoff is immediate and total, including history
already viewed.** If an account moves to Private, the household loses
access to it — past and future — not just going forward. This was a
real, deliberate choice, not the only defensible one (an alternative
would let already-seen history remain visible) — but a boundary that
only applies to new data isn't really a boundary, it's a filter with a
memory gap, the same category of problem as Monarch's fake-private
transactions. If this needs revisiting later, it should be a conscious
re-decision, not a default nobody chose.

## Someone leaves the household

Two different things, resolved differently:

- **Their Private resources** — untouched; the household never had
  access.
- **Their Shared resources** — the historical record stays visible to
  remaining members. This isn't a new policy — it matches the existing
  live copy on the "Leave household" confirmation dialog: *"Shared
  household information will stay for the other members."* This spec
  honors that existing promise rather than overriding it.
  **Practical consequence, not a policy choice:** the live bank
  connection stops updating once they leave, since only the person who
  connected the account has the underlying bank credentials. The shared
  record becomes a frozen historical snapshot unless someone else in the
  household reconnects it independently.

## Disconnect vs. delete — two different actions, not one

- **Disconnect** (stop live sync) — historical data stays, existing
  visibility setting is respected. The existing Connections page
  disconnect-with-warning flow already does the "warn first" part
  correctly; this doesn't need to change.
- **Delete** — archive, don't destroy, same pattern already used
  elsewhere (the `archived` flag `accounts` already has). **Real,
  permanent data erasure is explicitly not resolved here** — it's
  already an open item in `docs/product/privacy-draft.md`, flagged
  "NEEDS LEGAL REVIEW" for retention and deletion rights. This spec
  plugs into that existing open question rather than inventing a second,
  conflicting answer to it.

## Decisions — resolved as permanent-once-shared, no visibility
mechanism needed

Investigated directly rather than assumed: Decisions have no financial
numeric fields at all, no structured link to any account, and are never
re-read or recomputed after saving — confirmed via the actual schema and
insert payload (`app/api/decisions/route.ts`). Everything in a saved
Decision is text a person actively wrote or confirmed (`user_reasoning`,
AI-framed text they approved) — there is no live number to redact and
nothing automatic ever gets pulled in.

**Resolution: a Decision is permanent once shared, exactly as written,
forever — the same way a real conversation is permanent.** If someone
tells their partner "I have $40k saved" while working through a
decision together, making the underlying account private afterward
doesn't unsay it. The system has no live linkage to intervene on, and
building one would be solving a problem that doesn't exist here.

**Why this is worth stating explicitly rather than leaving implicit:**
this is a genuinely different rule from Accounts' strict, total cutoff
above, and it would be easy for someone later to "fix" Decisions into
matching Accounts' behavior without understanding why they're not the
same problem. Accounts have a live, changeable source of truth to
protect. Decisions are a record of something that was actually said —
protecting it the same way would mean editing history, not protecting
privacy.

**Adjacent, not resolved here:** `lib/lifecfo/verdictDecision.ts` (Home
Ask's "verdict" feature) does read live account balances, separately
from the Decisions table entirely — confirmed it never writes to
`decisions`. If Home Ask's verdict responses are ever logged or saved
anywhere in the future, this same thinking would need to apply to that
feature specifically. Flagged as a marker for later, not a current gap.

## Explicitly out of scope for this pass

- Whole-household deletion (cascading what happens to all shared data
  when a household itself is deleted, not just one member leaving) — a
  bigger, separate question, not decided as a side effect of visibility
  tiers.
- Extending visibility tiers to Goals, Family & pets, or other
  resources beyond Accounts and Decisions — the two the original
  example named. Worth considering later; not assumed here.
- Actual permanent data deletion mechanics — owned by
  `privacy-draft.md`'s existing open legal-review item.

## Schema dependency

Accounts needs a new `visibility` column (`shared` / `summary_only` /
`private`, similar enum-style CHECK pattern to `confidence_tier` on
`recurring_income`), plus real RLS policy changes enforcing it —
`summary_only` in particular needs a policy that can expose an aggregate
without exposing row-level transaction detail, which is more than a
simple boolean read-gate. This is real migration and policy work, not a
UI-only change — same category of effort as the pattern-confirmation
promotion fix, not a quick pass.

## Non-goals

- No UI-only "private" — must be a real RLS boundary, not a client-side
  filter, per the Monarch correction above.
- No household-role override of personal resource visibility, ever.
- No visibility mechanism built for Decisions — resolved as
  unnecessary, not deferred.
