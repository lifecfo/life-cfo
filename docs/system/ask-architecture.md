# Life CFO - Ask Architecture
Last updated: 2026-03-14

This document describes the current implemented Ask architecture.

---

# Purpose

Ask is the conversational reasoning layer.

It is designed to:
- answer household questions with grounded data
- keep output calm and plain-English
- support decisions without giving financial advice

Ask is not an autonomous system.
It does not write money data or perform financial actions.

---

# Runtime Architecture

Ask has two active API paths selected by UI scope:

- Money scope (`/money*`) -> `/api/money/ask`
- Other app scopes -> `/api/home/ask`

Scope selection happens in `components/ask/AskProvider.tsx`.

---

# Ask Pipeline (Current)

1. User asks in `AskPanel`.
2. `AskProvider` resolves scope and route.
3. API route loads signed-in user context and household/user facts.
4. Route chooses a mode (deterministic branch or AI-structured branch, depending on route).
5. Route returns structured payload.
6. `AskProvider` formats response into calm, readable sections using `moneyAskLanguage.ts`.

---

# Money Ask: Implemented Intents/Modes

`/api/money/ask` currently supports:

- `snapshot` (orientation baseline)
- `diagnosis`
- `planning`
- `affordability`
- `scenario`
- `search` (retrieval fallback)

Mode selection is keyword/rule based.

Money Ask data path:
- `getHouseholdMoneyTruth`
- `buildFinancialSnapshot`
- `explainSnapshot`

This keeps money Ask grounded in current household snapshot and pressure signals.

---

# Home Ask: Implemented Behavior

`/api/home/ask` handles broader, non-money-only context.

Current behavior includes:
- deterministic handlers for specific intents (for example review/chapters/goals/buffer/affordability baseline)
- structured AI output with schema enforcement for general home questions
- tone and verdict post-processing (`homeTone`, `verdictDecision`)

---

# Output Shaping

Money Ask answers are normalized in the client with:
- `composeMessage`
- `section`
- `stableGroundLine`

This produces:
- concise heading/summary
- short evidence bullets
- calm grounding line

The UI keeps responses readable and low-cognitive-load.

---

# Data Boundaries and Safety

Money Ask routes enforce:
- signed-in user checks
- household membership checks
- household-scoped reads only

Ask may:
- analyze
- explain
- compare scenarios
- summarize

Ask must not:
- move money
- initiate transactions
- mutate financial state autonomously
- present itself as financial advice

---

# Current Intent Coverage Notes

Canonical intent labels used across docs/product include:
- orientation
- affordability
- diagnosis
- planning
- comparison
- scenario
- memory recall
- output generation

Current code-level status:
- money route implements orientation/affordability/diagnosis/planning/scenario plus search
- broader memory and decision context is primarily handled through home/decisions surfaces

---

# Product Tone and Language Guidelines

Life CFO should sound like an intelligent, money-savvy best friend.

Communication style:
- calm
- plain language
- intelligent but not technical
- reassuring
- optimistic and hope-leaning
- never judgemental
- never corporate

Important principle:
- Lean slightly hopeful without ignoring reality.

When pressure exists, responses should:
- acknowledge what is true
- explain what is happening
- point out what is still okay
- show that options still exist

Preferred examples:
- "A big part of your income is already going toward regular bills. That can make things feel tight sometimes."
- "Nothing here looks dangerous, but there may be a few ways to create more breathing room."
- "This is fairly common and often easier to adjust than it first appears."

Avoid:
- bank-report tone
- guru tone
- lecturing
- heavy jargon like "financial optimisation" or "liquidity management"

Prefer words like:
- breathing room
- pressure
- flexibility
- options
