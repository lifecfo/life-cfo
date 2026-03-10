# Life CFO – System State
Last updated: March 2026

This document describes the current technical state of the Life CFO system so AI tooling (Codex, ChatGPT) and developers can understand the architecture without reading the entire codebase.

---

# Core Architecture

Life CFO is a household-scoped financial decision intelligence system.

The product helps households reason through financial decisions using real financial data.

The system is built with a calm UX and a trust-first architecture.

Primary stack:

Next.js App Router
Supabase (Postgres + Auth + RLS)
Vercel hosting
Plaid + Basiq provider integrations

All financial data is scoped to a household.

household_id is the primary access boundary.

---

# Money System Architecture

Money is organised around four flows:

IN
OUT
SAVED
PLANNED

The Money Hub shows small slices of each.

Drill-downs provide deeper exploration.

Money Hub is not a dashboard.

It is a calm orientation surface.

Lists are intentionally short.

Search and Ask are the primary interaction mechanisms.

---

# AI Interaction Model

Life CFO provides financial analysis and scenario exploration.

It does not provide financial advice.

AI acts as a reasoning layer over household financial data.

AI may:

analyse
explain
compare scenarios
summarise
generate structured outputs

AI cannot:

move money
initiate transactions
make decisions
change stored data autonomously

All durable state changes require explicit user action.

---

# Ask Architecture

Life CFO uses a structured Ask reasoning system.

Ask is not a general chatbot.

User questions follow a structured reasoning pipeline:

User Question
↓
Intent Classification
↓
Retrieval Pack Assembly
↓
Reasoning Contract
↓
Structured Result
↓
UI Rendering

Ask supports the following canonical intents:

orientation
affordability
diagnosis
planning
comparison
scenario
memory recall
output generation

Each intent uses a defined reasoning contract and retrieval pack to ensure consistent, explainable outputs.

The full design is defined in:

docs/system/ask-architecture.md

---

# Database Tables

Core financial tables:

accounts
transactions
external_connections
external_accounts
money_goals

All tables use Row Level Security.

household_id is the access boundary.

RLS allows:

SELECT for household members
INSERT / UPDATE / DELETE for owner/editor roles

External provider data flows into these tables via sync processes.

---

# Provider Integrations

Current providers:

Plaid
Basiq

Plaid is fully implemented in sandbox.

Plaid architecture includes:

lib/money/plaidClient.ts

api routes

/api/money/plaid/link
/api/money/plaid/exchange
/api/money/sync/[connectionId]

Sync uses:

accountsGet
transactionsSync
cursor-based transaction sync

Basiq integration is partially implemented.

Consent flow exists.

basiqProvider.sync() still needs full implementation.

---

# Key API Routes

Money

/api/money/plaid/link
/api/money/plaid/exchange
/api/money/sync/[connectionId]
/api/money/connections

Ask

/api/home/ask

---

# Key UI Pages

Money Hub

app/(app)/money/page.tsx

Connections page

app/(app)/connections/page.tsx

Money drill-downs

app/(app)/money/in
app/(app)/money/out
app/(app)/money/saved
app/(app)/money/planned

---

# Security Model

Authentication

Supabase Auth

Authorization

Row Level Security

household scoped data access

Infrastructure

Vercel hosting
Supabase database

External financial providers accessed through server-side API routes.

Access tokens stored securely.

Bank credentials never stored.

---

# Current Development Priorities

Priority order:

1. Standardise household-scoped API access for all money operations.

2. Formalise provider connection state machine.

3. Implement Basiq sync parity with Plaid.

4. Reduce oversized files and extract domain modules.

5. Consolidate Supabase client usage patterns.

---

# Product Direction

Life CFO is designed to:

reduce financial cognitive load
support better decision making
provide calm financial clarity

The goal is to build a trusted "Life CFO" that helps people reason through financial decisions.