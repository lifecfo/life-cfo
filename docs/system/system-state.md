# Life CFO - System State
Last updated: 2026-03-14

This document reflects the current implemented system state in the repository.

---

# Core Architecture

Life CFO is a household-scoped financial decision intelligence application.

Primary stack:
- Next.js App Router
- Supabase (Postgres, Auth, RLS)
- Vercel
- Plaid and Basiq provider integrations

All money data is scoped by `household_id`.

---

# Household-Scoped Data Model

Household scope is enforced by:
- membership checks in `household_members`
- active household cookie `lifecfo_household`
- route-level household resolution in `resolveHouseholdIdRoute`

Current behavior:
- API routes resolve active household from cookie, then validate membership.
- If cookie is missing/invalid, routes fall back to earliest membership.
- Household switching is supported via `/api/households/active`.

---

# Money System Overview

Money Hub lives at `app/(app)/money/page.tsx` and stays compact by design.

Money is organized into four flows:
- In
- Out
- Saved
- Planned

Implemented pages:
- Money Hub: `app/(app)/money/page.tsx`
- In: `app/(app)/money/in`
- Out: `app/(app)/money/out`
- Saved: `app/(app)/money/saved`
- Planned: `app/(app)/money/planned`
- Accounts: `app/(app)/accounts`
- Transactions: `app/(app)/transactions`
- Connections: `app/(app)/connections`

---

# Reasoning Architecture (Current)

Life CFO money reasoning currently follows this chain:

Truth -> Flow -> Structure -> Time -> Decision -> Scenario -> Memory

How this maps to current code:
- Truth: `getHouseholdMoneyTruth` reads household-scoped raw data.
- Flow: Money Hub and flow pages orient users around In, Out, Saved, Planned.
- Structure: `buildFinancialSnapshot` creates stable balances, income, commitments, discretionary, and connection health fields.
- Time: windows (`now`, `next30`, month bounds), due dates, next pay dates, and connection age are used in reasoning.
- Decision: Money Ask modes (`snapshot`, `diagnosis`, `planning`, `affordability`) provide decision-support framing.
- Scenario: Money Ask `scenario` mode provides baseline what-if reasoning.
- Memory: recent money asks are stored client-side (`lifecfo:money-recent-asks`), and broader decision memory exists in home/decisions flows.

---

# Financial Snapshot + Pressure Layer

Snapshot pipeline:
- route: `/api/money/overview`
- inputs: `getHouseholdMoneyTruth`
- transform: `buildFinancialSnapshot`
- explanation: `explainSnapshot`

Pressure signals are computed in `pressureSignals.ts`:
- structural_pressure
- discretionary_drift
- timing_mismatch
- stability_risk

These signals are used by Money Hub and Money Ask responses.

---

# Ask System (Current)

Ask routing is scope-aware in `AskProvider`:
- Money scope (`/money*`) -> `/api/money/ask`
- Other app scopes -> `/api/home/ask`

Current money intents/modes in `/api/money/ask`:
- `snapshot` (orientation)
- `diagnosis`
- `planning`
- `affordability`
- `scenario`
- `search` (retrieval fallback)

Current home ask (`/api/home/ask`) combines deterministic handlers and structured AI output for broader app context (decisions, review, chapters, goals, etc.).

Ask UI state is managed by:
- `components/ask/AskProvider.tsx`
- `components/ask/AskPanel.tsx`
- `components/ask/moneyAskLanguage.ts`

---

# Provider Integrations (Current)

Providers registered in `lib/money/providers`:
- `manual`
- `plaid`
- `basiq`

Status:
- Plaid: implemented and syncing accounts + transactions with cursor-based sync.
- Basiq: implemented consent/start flow and sync path; still less mature than Plaid and treated as partial parity.
- Manual: no external sync; returns zero upserts.

---

# Connection Lifecycle and Sync Flow

Current connection statuses used by routes/UI:
- `manual`
- `needs_auth`
- `active`
- `error`

Lifecycle:
1. Create connection via `/api/money/connections`.
2. Provider auth starts:
- Plaid: `/api/money/plaid/link` -> Link flow -> `/api/money/plaid/exchange`
- Basiq: `/api/money/basiq/start` -> consent redirect -> `/api/money/basiq/return`
3. Sync via `/api/money/sync/[connectionId]`.
4. Provider `sync()` upserts accounts/transactions and updates connection timestamps/status.

Notes:
- Basiq reuses existing `needs_auth`/`error` rows when possible.
- Connections page supports connect/continue setup/refresh flows and separates connected vs needs-attention states.

---

# Security and Safety Model

- Auth: Supabase Auth
- Authorization: household membership + role checks + RLS
- External provider access: server-side route handlers only
- Bank credentials are not stored directly by Life CFO
- AI is analysis-only; no autonomous money movement

---

# Product Tone and Language Guidelines

Life CFO should sound like an intelligent, money-savvy best friend.

Communication style must be:
- calm
- plain language
- intelligent but not technical
- reassuring
- optimistic and hope-leaning
- never judgemental
- never corporate

Important tone principle:
- Explanations should lean slightly positive or hopeful without being unrealistic.

When describing pressure, language should:
- acknowledge reality
- explain what is happening
- highlight what is still okay
- suggest that improvement or options exist

Examples of desired tone:
- "A big part of your income is already going toward regular bills. That can make things feel tight sometimes."
- "Nothing here looks dangerous, but there may be a few ways to create more breathing room."
- "This is fairly common and often easier to adjust than it first appears."

Avoid tone that feels like:
- a bank report
- a finance guru
- a spreadsheet
- a lecture

Avoid jargon such as:
- financial optimisation
- liquidity management
- spend discipline

Prefer natural language such as:
- breathing room
- pressure
- flexibility
- options

Emotional goal:
When users close the app, they should feel:
- clearer
- calmer
- more hopeful
- less mentally burdened
