# Demo household fixtures

The offline fixture tool creates isolated demo households for allowlisted testers. Every fixture-owned ID is derived from the scenario, tester user ID, and fixture version.

## Full demo for one tester

Use a dedicated test-user UUID already listed in `DEMO_ALLOWED_OWNER_USER_IDS`. Dry-run both scenarios first:

```powershell
npm run demo:seed -- --scenario family-one-income --owner-user-id <tester-user-uuid> --dry-run
npm run demo:seed -- --scenario single-parent-tight --owner-user-id <tester-user-uuid> --dry-run
```

Then provision both demo households:

```powershell
npm run demo:seed -- --scenario family-one-income --owner-user-id <tester-user-uuid> --apply
npm run demo:seed -- --scenario single-parent-tight --owner-user-id <tester-user-uuid> --apply
```

The tester receives:

- **Family With One Main Income** — two sample adults, two children, a current pet, an archived pet, four accounts, six months of transactions, formal income and bill timing, reviewed money patterns, two goals, and two decisions.
- **Single Parent, Tight Budget** — one sample adult, two children, a pet, a smaller buffer, irregular support income, a recent unexpected car cost, formal timing, reviewed money patterns, two goals, and two decisions.

All names, merchants, accounts, and transactions are fictional demo data.

## Inspect

```powershell
npm run demo:inspect -- --scenario family-one-income --owner-user-id <tester-user-uuid>
npm run demo:inspect -- --scenario single-parent-tight --owner-user-id <tester-user-uuid>
```

## Reset one scenario

Use the exact household ID printed by that scenario's dry-run or apply output:

```powershell
npm run demo:reset -- --scenario family-one-income --owner-user-id <tester-user-uuid> --confirm-household <family-household-id>
npm run demo:reset -- --scenario single-parent-tight --owner-user-id <tester-user-uuid> --confirm-household <single-parent-household-id>
```

Reset verifies the exact tester membership, household ID and name, source ID, provider/status, scenario marker, fixture version, and `metadata.demo = true` before deleting fixture rows. Resetting one tester or scenario cannot match another tester or scenario.

## Isolation check

```powershell
npm run demo:assert-isolation
```

This checks both scenarios across two tester IDs and checks both scenarios for one tester.

## Demo-beta safety

Trusted demo-beta testers should use these prepared households only. They should not connect real bank accounts, upload real bank files, or enter real personal financial information during the demo beta.

Ordinary beta users run in demo mode by default, including users with missing or unknown `lifecfo_access` metadata. The explicit demo value remains supported:

```json
{ "lifecfo_access": "demo_beta" }
```

Developers who need real-data tools must use server-trusted Supabase Auth **app metadata**. Do not use editable user metadata:

```json
{ "lifecfo_access": "developer" }
```

Apply developer access through the Supabase dashboard or a trusted offline admin process.

After accepting the important information and signing in, a demo-mode user with missing demo households is sent to Household and setup starts automatically. The server prepares only that authenticated user's two deterministic demo households. Refreshing or retrying skips existing rows and finishes missing rows without resetting or overwriting demo data. The manual `demo:seed`, `demo:inspect`, and `demo:reset` commands remain available for trusted support and developer use.
