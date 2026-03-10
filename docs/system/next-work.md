# Life CFO — Next Work

Last updated: 2026-03-11

## Current focus
Standardise household-scoped data access across Money UI and APIs.

## In progress
- Review Money pages and routes for any remaining user-scoped or client-direct data access
- Confirm intended scoping for money goals
- Identify safe API-first replacements for inconsistent access paths

## Next
1. Lock household-scoping consistency across Money
2. Define canonical provider connection state model
3. Complete Basiq sync parity
4. Refactor oversized Money and Connections files incrementally

## Blockers / checks
- Confirm whether `money_goals` should be household-scoped or intentionally user-scoped
- Confirm external connection metadata/schema expectations across Plaid and Basiq
- Confirm token storage/encryption expectations

## Notes
- Do not start large refactors before core contracts are stable
- Prefer architecture-correctness before cleanup work