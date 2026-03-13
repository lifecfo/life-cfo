# Life CFO - Money Reasoning Layer
Last updated: 2026-03-14

This document describes the current money reasoning layer as implemented.

---

# Scope

The money reasoning layer turns household-scoped financial truth into decision-ready context for:
- Money Hub
- flow pages (In, Out, Saved, Planned)
- Money Ask

Core inputs are loaded by `getHouseholdMoneyTruth`.

---

# Reasoning Chain (Current)

The current reasoning chain is:

Truth -> Flow -> Structure -> Time -> Decision -> Scenario -> Memory

---

# 1) Truth

Implemented in `lib/money/reasoning/getHouseholdMoneyTruth.ts`.

Current truth sources include:
- accounts
- transactions (recent, month, rolling windows)
- recurring bills
- recurring income
- money goals
- liabilities
- external connections
- selected count metrics (budget items, investment accounts)

All reads are household-scoped.

---

# 2) Flow

Money is presented through four user-facing flows:
- In
- Out
- Saved
- Planned

Flow surfaces:
- Money Hub summary cards
- dedicated flow pages under `app/(app)/money/*`
- Out route (`/api/money/out`) for outgoing-focused rollups

---

# 3) Structure

`buildFinancialSnapshot` compacts truth into stable structures:
- liquidity
- recurring income
- recurring commitments
- discretionary outflow (last 30 days)
- connection health
- pressure signals

`explainSnapshot` adds short headline/summary/insight language.

---

# 4) Time

Time is explicit in the current model:
- request windows (`now`, `next30`, month start/end)
- recurring bill due dates
- recurring income pay dates
- transaction windows for month and rolling periods
- connection age / staleness

Time is used heavily in planning and timing-mismatch logic.

---

# 5) Decision

Decision-support currently appears in money Ask modes:
- snapshot baseline
- diagnosis
- planning
- affordability

These responses are analytical and non-directive.

---

# 6) Scenario

Money Ask has a dedicated `scenario` mode.

Current behavior:
- returns baseline conditions from the snapshot
- highlights watch points
- includes caveats when prompt detail or data freshness is limited

---

# 7) Memory

Current memory-related behavior in money context:
- recent money asks are stored client-side (`lifecfo:money-recent-asks`)
- previous questions can be re-opened quickly on Money Hub

Broader decision memory exists in home/decisions features and routes.

---

# Pressure Signals in the Layer

`evaluatePressureSignals` currently computes:
- structural pressure
- discretionary drift
- timing mismatch
- stability risk

These signals are part of snapshot output and are reused by Money Hub and Money Ask.

---

# Household Boundary and Safety

The reasoning layer is household-scoped and read-only.

It does not:
- execute transactions
- auto-change user financial records
- perform autonomous decision actions

---

# Product Tone and Language Guidelines

All money reasoning explanations should read like an intelligent, money-savvy best friend:
- calm
- plain language
- reassuring
- slightly hope-leaning
- never judgemental
- never corporate

When pressure is present, explain clearly while still showing where flexibility or options remain.
