# Demo household fixture

The fixture creates one isolated demo household per allowlisted tester. Its IDs are derived from the scenario, tester user ID, and fixture version.

Use a dedicated test-user UUID already listed in `DEMO_ALLOWED_OWNER_USER_IDS`:

```powershell
npm run demo:seed -- --scenario family-one-income --owner-user-id <tester-user-uuid> --dry-run
npm run demo:seed -- --scenario family-one-income --owner-user-id <tester-user-uuid> --apply
npm run demo:inspect -- --scenario family-one-income --owner-user-id <tester-user-uuid>
npm run demo:reset -- --scenario family-one-income --owner-user-id <tester-user-uuid> --confirm-household <household-id-from-dry-run>
```

Provision another tester by running the same commands with their allowlisted user UUID. Reset verifies the exact tester, household ID, source ID, and demo metadata before deleting fixture rows.

Run the pure ID-isolation check with:

```powershell
npm run demo:assert-isolation
```
