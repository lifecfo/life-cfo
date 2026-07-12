# Current Life CFO Money Model

This is Life CFO's current working money model. It is allowed to evolve. When the product direction changes, update this document so future product and build work stays aligned.

## 1. What this document is

This document captures the current product direction for Life CFO's money surfaces.

It is not a permanent rulebook. It exists to reduce scattered product and build decisions, especially while the app is moving from early exploration into beta.

Use it as the shared reference before changing money product UI, navigation, schema, or copy. If the direction changes, update this document first or as part of the same task.

## 2. What Life CFO is trying to help people see

Life CFO is a household money picture and decision-support app. It helps people see enough of the picture to understand their situation and think through decisions.

The product should keep coming back to five simple questions:

1. Where is the money?
2. What is the money for?
3. What is coming up?
4. What needs review?
5. What decision needs thinking through?

Life CFO provides visibility, structure, and scenario thinking. It does not give financial advice, investment advice, lending advice, or tell users what they should do.

## 3. Current product principles

These are current working principles, not permanent rules.

### The user decides what it means

Life CFO can show what it can currently see, what is coming up, what has changed, and what may be worth reviewing.

It should not tell the user whether their situation is good or bad. The household decides what the information means for them.

### Non-engagement is a success state

Life CFO should not create unnecessary tasks, warnings, alerts, or pressure.

If nothing needs review, the product should be able to stay quiet. Quiet is not a failure state.

### Conversation-first, pages-second

Life CFO has two natural ways in:

- **Ask / Talk to me:** for people who want to ask questions in plain English.
- **Pages:** for people who want to go directly to Money, Decisions, Household, or Settings.

Both ways in should use the same household money picture underneath. Ask should not invent a separate version of the household picture, and pages should not contradict what Ask says.

## 4. Current working model

### Home

**What it currently means:** A simple starting point. It should show what Life CFO can currently see, what is coming up, what may need review, and where to go next.

**What it should not accidentally become:** A dense dashboard, a system-status page, a subjective "am I okay?" answer, or a place that tries to explain every money detail.

**Important framing:** The user decides what it means.

**Status:** settled for now.

### Money Overview

**What it currently means:** The main monthly money snapshot. It shows money in, money out, left over, cash, and the clearest next step.

**What it should not accidentally become:** A full budget system, a forecast, or a diagnostic report.

**Status:** settled for now.

### Money Map

**What it currently means:** The current-state money surface. It should answer where the money is and how the visible picture is organised.

**What it should not accidentally become:** A net-worth-first page or a place where separate planning concepts are mixed without explanation.

**Status:** likely direction.

### Cash Plan

**What it currently means:** A read-only review of what some visible cash is currently being tracked for.

**What it should not accidentally become:** A system that moves money, reserves money, deducts buckets from balances, or calculates flexible cash before that model is ready.

**Status:** likely direction.

### Year at a glance

**What it currently means:** A simple upcoming timing surface based on schedules currently added.

**What it should not accidentally become:** A complete household forecast or a prediction of the whole future.

**Status:** settled for now.

### Monthly Plan

**What it currently means:** The likely future role for Budget. It should show expected money in, expected money out, and what may be left.

**What it should not accidentally become:** A rulebook, a judgement system, or advice about what a household should spend.

**Status:** likely direction.

### Money in

**What it currently means:** Money coming into the household, including income Life CFO can see and income timing the user has added.

**What it should not accidentally become:** A mandatory setup page before Life CFO can help.

**Status:** settled for now.

### Money out

**What it currently means:** Bills, spending, and money leaving the household.

**What it should not accidentally become:** A page that calls every repeated spending pattern a bill, or makes setup feel required.

**Status:** settled for now.

### Bill dates

**What it currently means:** Known bill dates the household has added or wants Life CFO to keep in mind.

**What it should not accidentally become:** A mandatory bill-entry system or a claim that Life CFO can infer every future bill perfectly.

**Status:** likely direction.

### Goals

**What it currently means:** Things the household wants to keep in view.

**What it should not accidentally become:** Recommended targets, advice, or a claim that goal money is automatically linked to account balances.

**Status:** likely direction.

### Safety buffer

**What it currently means:** The likely future role for Buffer. It should probably become a goal type rather than a standalone product area.

**What it should not accidentally become:** A separate advice surface telling users how much emergency money they should have.

**Status:** likely direction.

### Assets & debts

**What it currently means:** The likely future home for assets, debts, and possibly a simple net-worth snapshot.

**What it should not accidentally become:** A net-worth-first product model or a complete wealth-management system.

**Status:** needs product decision.

### Debts

**What it currently means:** Household context about what is owed.

**What it should not accidentally become:** Credit assessment, lending advice, repayment advice, or judgement.

**Status:** likely direction.

### Investments / long-term assets

**What it currently means:** Long-term asset visibility. Life CFO may show balances, ownership, account context, and long-term visibility.

**What it should not accidentally become:** Advice to buy, sell, switch, allocate, or choose where money should be invested.

**Status:** needs product decision.

### Saved

**What it currently means:** A useful supporting view for saved money, goals, and progress.

**What it should not accidentally become:** A duplicate of Money Map, Goals, or Cash Plan.

**Status:** still open.

### Planned

**What it currently means:** A useful supporting view for upcoming timing, dates, and things already in view.

**What it should not accidentally become:** A full forecast, a mandatory setup area, or a duplicate of Year at a glance.

**Status:** still open.

## 5. Current route destination map

This table reflects the current direction. It can change as the product model evolves.

| Current route | Current concept | Current likely future | Status | Navigation status for now | Notes |
| --- | --- | --- | --- | --- | --- |
| `/budget` | Budget | Monthly Plan | likely direction | hidden | Budgeting should exist, but should not define the product. |
| `/net-worth` | Net worth | Merge into Money Map / Assets & debts | needs product decision | hidden | Net worth is not the main user-facing model. |
| `/buffer` | Buffer | Safety buffer goal | likely direction | hidden | Better as a goal type than a standalone area. |
| `/liabilities` | Liabilities | Debts inside Assets & debts | likely direction | hidden | User-facing language should be "Debts". |
| `/investments` | Investments | Long-term assets / visibility only | needs product decision | hidden | Must avoid investment advice. |
| `/bills` | Bills | Bill dates | likely direction | hidden | Should feel optional and useful, not mandatory setup. |
| `/money/saved` | Saved | Supporting view, long-term role open | still open | hidden | May later merge deeper into Money Map, Goals, or Cash Plan. |
| `/money/planned` | Planned | Supporting view, long-term role open | still open | hidden | May later merge deeper into Year, Goals, or Bill dates. |
| `/money/goals` | Goals | Goals | likely direction | hidden | Goals are household-defined and should not imply advice. |
| `/money/map` | Money Map | Current-state surface | likely direction | visible | Should own the broader current household money picture. |
| `/money/year` | Year at a glance | Upcoming timing surface | settled for now | visible | Based on schedules currently added, not a full forecast. |
| `/money/in` | Money in | Visible Money detail | settled for now | visible | Money coming into the household. |
| `/money/out` | Money out | Visible Money detail | settled for now | visible | Bills, spending, and money leaving the household. |

## 6. Ownership and household context

Assets, debts, and investments need ownership context before they become a clearer product area.

Future modelling should consider ownership such as:

- household
- one adult
- shared
- business
- child
- other

This is a future data-model direction, not a migration to build now.

## 7. Trust and wording guardrails

These guardrails are here to keep the product clear and safe. They are not meant to be rigid.

Avoid wording that sounds like:

- financial advice
- investment advice
- credit assessment
- guaranteed outcomes
- telling users what they should do
- promising stress removal
- pretending forecasts are perfect
- telling users they are okay or not okay
- comfort signals that imply Life CFO knows how the household should feel

Prefer wording like:

- worth reviewing
- based on what Life CFO can currently see
- what is coming up
- what has changed
- user-defined
- household-chosen
- for visibility only
- nothing moves automatically
- not advice

## 8. What is still open

These product decisions are intentionally not locked yet:

- exact label: Assets & debts vs Where you stand
- whether Monthly Plan is visible in beta
- how investments appear in private beta
- whether Saved and Planned stay as pages
- how Goals and Cash Plan should connect
- whether business/child ownership is V1 or later

## 9. How future Codex tasks should use this

Before changing money product UI, navigation, schema, or copy, Codex should check this document and explain whether the task fits the current model.

If the product direction has changed, update this document as part of the task.

If a new money concept is being introduced, explain where it fits before building it.

Do not add new finance-tool pages just because routes already exist.
