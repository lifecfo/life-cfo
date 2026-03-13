# Life CFO - Financial Snapshot Engine
Last updated: 2026-03-14

This document describes the current implemented snapshot engine.

---

# Purpose

The snapshot engine converts household financial truth into a compact state object used by:
- Money Hub
- money flow pages
- `/api/money/ask`

This reduces repeated raw-query reasoning and keeps answers consistent.

---

# Build Path

Current path:
- truth fetch: `getHouseholdMoneyTruth`
- snapshot build: `buildFinancialSnapshot`
- explanation build: `explainSnapshot`

Main API entry:
- `/api/money/overview`

Money Ask also builds snapshot/explanation directly during request handling.

---

# Current Snapshot Shape

`FinancialSnapshot` currently contains:

- `asOf`
- `liquidity`
  - `availableCashCents`
  - `accountCount`
- `income`
  - `recurringMonthlyCents`
  - `sourceCount`
- `commitments`
  - `recurringMonthlyCents`
  - `billCount`
- `discretionary`
  - `last30DayOutflowCents`
- `connections`
  - `total`
  - `stale`
  - `maxAgeDays`
- `pressure`
  - `structural_pressure`
  - `discretionary_drift`
  - `timing_mismatch`
  - `stability_risk`

---

# Connection Health Rules (Current)

Connection health uses `external_connections` truth rows.

Current logic:
- `stale` counts connections older than 7 days since `last_sync_at` or `updated_at`
- `maxAgeDays` is the maximum computed age (or `Infinity` when age cannot be computed)

---

# Explanation Layer (Current)

`explainSnapshot` returns:
- `headline`
- `summary`
- `insights[]`
- `pressure` text object (`structural`, `discretionary`, `timing`, `stability`)

This is the short human-readable layer used by Money Hub cards and Ask formatting.

---

# Data Inputs Used

Snapshot construction currently depends on:
- active non-archived household accounts
- rolling or month transactions
- active recurring bills
- active recurring income
- external connection sync metadata

---

# Recompute Model

Snapshot is recomputed on demand per request in current routes.

Typical triggers:
- Money Hub load/refresh
- Money Ask requests
- user returns to focused tab/window (client-side refresh behavior)

---

# Boundaries

Snapshot is:
- household-scoped
- read-only derived state
- intentionally compact

Snapshot is not:
- a full ledger
- a write path
- an autonomous action engine

---

# Product Tone and Language Guidelines

Snapshot explanations should be:
- calm
- plain-English
- grounded
- slightly hopeful without sugar-coating

Even under pressure, wording should show what is still stable and where options may exist.
