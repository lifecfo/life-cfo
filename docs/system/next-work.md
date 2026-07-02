# Life CFO - Next Work

Last updated: 2026-07-02

## Current beta target

Life CFO is nearly ready for a trusted **demo-data beta only**.

- Ordinary users receive isolated sample households automatically.
- Demo users do not need to connect a bank or upload financial files.
- Real-data tools remain available only to users marked as developers in server-trusted app metadata.
- Provider route hardening for the demo-data beta is complete.

## Before live bank-data beta

Complete and verify before inviting people to use live financial data:

1. Privacy Policy
2. Terms
3. Acceptance versioning and re-acceptance rules
4. LocalStorage Ask cleanup
5. Broader account deletion, household deletion, ownership, leaving, and data export decisions
6. Provider production, consent, revocation, retention, and compliance pathways

## Notes

- Keep the current beta positioned as sample-data exploration.
- Do not invite ordinary beta users to connect real financial data yet.
- Preserve household scoping and calm, non-advisory language.
- Money Map v1 is read-only and does not move or allocate money.
- Cash Plan database tables now provide the read-only allocation foundation.
- UI, server routes, demo seeding, account-backed display, and concurrency-safe allocation RPCs remain future work.
- Account-backed buckets and movement-to-review still require those controlled write paths.
- Known one-off costs remain future work.
