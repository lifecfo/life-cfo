# Life CFO - Next Work

Last updated: 2026-07-05

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
- Money Map v1 remains read-only and does not move or allocate money.
- The read-only Cash Plan helper and authenticated `GET /api/money/cash-plan` route are complete.
- Cash Plan route and helper tests are complete.
- Both isolated demo households include account-backed, part-account, and tracked-only Cash Plan rows.
- Money Map now includes a compact read-only Cash Plan preview.
- Cash Plan is framed as: “For review only. Nothing has moved.”
- Flexible cash and unassigned cash are not calculated.
- Bucket amounts are not deducted from account balances.
- Home breathing room and available cash remain unchanged.
- Cash Plan editing does not exist yet.
- Concurrency-safe allocation write RPCs remain future work.
- Known one-off costs remain future work.

## Immediate next action

1. Run visual smoke testing with both demo households.
2. Gather tester feedback before adding more Money UI.
