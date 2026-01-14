# Keystone — MVP Data Model Lock

Date: 2026-01-14

## Guiding rule (MVP)
From this point on, we do NOT change existing columns/types unless:
1) it fixes a real bug, or
2) it is strictly required for automation correctness.

New capability should prefer:
- new tables, or
- new rows,
not “just one more column”.

Keystone should never guess.
It should only remind you of truths you already gave it.

---

## Tables locked (MVP)

### 1) public.accounts
Purpose: user-provided financial truth (balances).
Core fields:
- id (uuid, pk)
- user_id (uuid)
- name (text)
- current_balance_cents (int)
- currency (text, default "AUD")
- created_at (timestamptz)
- updated_at (timestamptz)

Rules:
- Money stored as integer cents.
- RLS: user can only access their own rows.

---

### 2) public.recurring_bills
Purpose: user-provided recurring obligations.
Core fields:
- id (uuid, pk)
- user_id (uuid)
- name (text)
- amount_cents (int)
- currency (text, default "AUD")
- cadence (text: weekly | fortnightly | monthly | yearly)
- next_due_at (timestamptz)
- autopay (bool)
- active (bool)
- created_at (timestamptz)
- updated_at (timestamptz)

Rules:
- Only "active = true" bills are used by Engine.
- next_due_at is the single source of truth for upcoming obligations.

---

### 3) public.recurring_income
Purpose: user-provided recurring income streams.
Core fields:
- id (uuid, pk)
- user_id (uuid)
- name (text)
- amount_cents (int)
- currency (text, default "AUD")
- cadence (text: weekly | fortnightly | monthly | yearly)
- next_pay_at (timestamptz)
- active (bool)
- created_at (timestamptz)
- updated_at (timestamptz)

Rules:
- Only "active = true" income is used by Engine.
- next_pay_at is the single source of truth for upcoming income.

---

### 4) public.decision_inbox
Purpose: actionable queue of reminders and decisions (manual + engine writes).
Core fields:
- id (uuid, pk)
- user_id (uuid)
- run_id (uuid, nullable)
- type (text)  // e.g. "engine", "next_action"
- title (text)
- body (text, nullable)
- severity (int, default 1) // 1=Top, 2=Mid, 3=Low
- status (text, default "open") // open | snoozed | done
- snoozed_until (timestamptz, nullable)
- created_at (timestamptz, default now())
- dedupe_key (text, not null)

Indexes/constraints:
- UNIQUE(user_id, dedupe_key)

Rules:
- Engine writes use UPSERT on (user_id, dedupe_key).
- Inbox shows Engine items with an Engine chip (UI).

---

### 5) public.decisions
Purpose: long-term immutable record of decisions.
Rules (conceptual lock):
- Decisions are facts once created.
- Review metadata is additive (history), not overwrite.
- Pinning and review scheduling are allowed as metadata.

(See current schema in Supabase as source of truth for column list.)

---

## Engine v1 contract (locked)

Engine reads:
- accounts
- recurring_bills (active only)
- recurring_income (active only)

Engine writes ONLY these deduped inbox items (type="engine"):

1) Safe-to-spend reminder
- dedupe_key: engine_safe_to_spend_week
- window: next 7 days (7d)
- body includes the exact calculation explanation:
  safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0)

2) Upcoming bills reminder
- dedupe_key: engine_upcoming_bills_14d
- window: next 14 days (14d)

No forecasting.
No graphs.
No guessing.

---

## Next phase after lock
1) UX polish (tiny improvements, not schema changes)
2) Automation (scheduled Engine run)
3) Optional: reporting/forecasting as separate modules (new tables)
