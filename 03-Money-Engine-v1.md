Keystone — Money Engine v1 (Execution Rules)
Status

Canonical — Locked unless a contradiction or safety issue is found

1. Purpose

Money Engine exists to reduce mental load by:

preventing missed payments, penalties, and avoidable interest

converting recurring money decisions into one-time approvals

smoothing irregular bills (rego, insurance, quarterly utilities)

enforcing bounded spending structurally (not via nagging)

It is not a budgeting app.
It does not coach.
It does not shame.
It does not optimise investments.

Success means the user opens Keystone rarely.

2. Inputs
Required (via provider)

account balances

transactions (≥90 days, ideally 12 months)

credit card minimum payment + due date (if available)

recurring merchant patterns

Optional (user-provided)

confirm/override pay cadence if confidence is low

choose Money Model (once)

mark a “Bills account” (or accept Keystone suggestion later)

set a minimum preferred buffer (simple range)

Keystone must not ask for information it can infer reliably.

3. Outputs

Money Engine produces three internal artifacts:

Money Model State

chosen model + parameters (Balanced / Savings-First / Cash-Flow-First)

bounds (how much can move automatically, caps, tolerances)

Obligation Ledger

recurring obligations (rent, utilities, subscriptions, debt payments)

irregular obligations (annual/quarterly)

next due estimates + confidence

Execution Plan

a schedule of intended actions (transfers, set-asides, payments)

each planned action ties back to consent

The user does not see these by default.

4. Supported Money Models (v1)

Keystone supports three operating modes. These are system behaviours, not “advice”.

4.1 Balanced (Default)

obligations funded first

savings allocated consistently

discretionary spending bounded

moderate operational buffer

4.2 Savings-First

higher savings allocation

tighter discretionary cap

larger buffer and faster goal progress

4.3 Cash-Flow-First

larger operational buffer

slower savings

maximum flexibility (useful for variable income)

Model choice is a one-time decision (changeable later intentionally).

5. Core Concepts (Definitions)
5.1 Bills vs Spending

Bills = obligations with consequences if missed (rent, utilities, insurance, debt minimums, subscriptions user chose)

Spending = variable discretionary or day-to-day (groceries/fuel are necessities but variable; treated differently)

v1 automates bills and debt payments, not variable shopping.

5.2 Buffers (no “safe” language)

Keystone uses:

Operational buffer: enough cash to cover planned obligations until next income + variance allowance

Preferred buffer (optional): user-chosen minimum range

Keystone never labels decisions “safe”.
It states numbers and trade-offs.

5.3 Annual / Irregular Bills

Annual/quarterly costs are handled by either:

Save-up (sinking fund): small set-asides leading to a single payment

Instalments: periodic payments (if supported)

Keystone prefers save-up unless user chooses otherwise.

6. Automation Levels (v1)
Level 1 — Mechanical automation (allowed in v1)

schedule known bill payments

set up credit card autopay minimum

run sinking fund transfers

income → allocation transfers within approved bounds

Level 2 — Conditional automation (allowed with strict bounds)

“pay statement balance” (credit card) if buffer remains above set threshold

dynamic top-ups to bills account when obligations change within tolerance

Level 3 — Not in v1

moving money between institutions to chase yield

changing user strategy without explicit choice

investment moves

7. Consent & Authority (Money)

No automation executes without an active consent that covers it:

Action consent: one-time payment/transfer

Scope consent: repeated actions within strict bounds

Structural consent: changes to account routing or model behaviour

Re-consent triggers

Automation pauses and requests confirmation when:

a bill amount changes beyond tolerance

a due pattern changes materially

income cadence changes materially

a new obligation would be included under scope

an account connection becomes uncertain

No silent scope expansion.

8. Decision Inbox Items (Money v1)

Money Engine may create only these decision types:

Choose Money Model (Balanced / Savings-First / Cash-Flow-First)

Set up routine bills once (bundle eligible obligations)

Handle annual bill (save-up vs instalments + automate)

Credit card payment setup (minimum vs statement balance + automation)

Income routing / allocation (fund bills + savings + discretionary caps)

All items must conform to the Decision Inbox contract:

one item active

clear payoff

one primary action

return to silence

Declines are recorded and never resurfaced automatically.

9. Execution Rules (Deterministic)
9.1 Income detection

infer cadence and typical amount

if confidence < threshold, create a single confirmation decision

do not execute allocations until cadence is confirmed or confidence is high

9.2 Obligation detection

identify recurring obligations with confidence

classify as bill vs non-bill

estimate next due date and tolerance

9.3 Allocation order (per pay cycle)

When income arrives and allocation consent exists:

Top-up Bills Account to cover:

upcoming obligations until next income

sinking fund set-asides

operational buffer

Emergency fund allocation (if enabled)

Long-term savings allocation (if enabled)

Daily spending allocation (bounded)

Leave remainder where it is (default)

Allocation never moves funds from long-term savings without explicit action consent.

9.4 Annual bills

If save-up selected:

schedule set-asides automatically

execute payment when due (with scope consent)
If instalments selected:

schedule instalments

monitor for failure

10. Failure Handling (Money)
10.1 Provider outage / stale data

pause dependent automations

only interrupt if a due obligation is imminent

10.2 Payment failure

create a protection decision immediately

include one corrective action (retry / manual / reschedule)

10.3 Income disruption

pause non-essential transfers

preserve bills coverage first

require re-consent for strategy changes

11. Audit Requirements (Money)

Every step must write audit events:

detection events (income/obligation detected)

decision created/approved/declined

consent granted/revoked

automation scheduled/executed/failed

pause/resume events

Audit events are append-only.

12. “Done” Definition for Money v1

Money v1 is done when:

users can connect accounts (or mock provider in dev)

Keystone detects income and true bills

Keystone generates the correct decision items

approvals create real automations

automations execute idempotently

failures are handled without chaos

the inbox is empty most days

End of Canonical Document #3