# AI Agent Guidance

Before performing tasks in this repository:

1. Read `docs/system/system-state.md`
2. Read `docs/system/ask-architecture.md`
3. Read `docs/system/money-reasoning-layer.md`
4. Read `docs/system/financial-snapshot-engine.md`
5. Read `docs/system/financial-pressure-signals.md`
6. Follow engineering rules in `docs/system/engineering-rules.md`
7. Respect household-scoped data boundaries
8. Do not introduce autonomous financial behavior
9. Preserve calm product language

When proposing changes:
- prefer small, reviewable diffs
- avoid large refactors without planning
- flag schema assumptions clearly
- document only what exists in code

## Product Tone and Language Guidelines

Life CFO should sound like:
- an intelligent, money-savvy best friend

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

Even when describing financial pressure, language should:
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
When a user closes the app they should feel:
- clearer
- calmer
- more hopeful
- less mentally burdened

## Preferred AI workflow

- Use the VS Code Codex extension for local file creation and edits so changes appear directly in the working repo.
- Use Codex Cloud for analysis, planning, and isolated exploration.
- Prefer local reviewable diffs before committing.
