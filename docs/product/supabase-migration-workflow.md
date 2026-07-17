# Supabase migration workflow — filename fix and current state

Read-only-investigation-turned-fix, documented so the reasoning isn't lost.

## What was broken

`supabase db push` previously failed outright with "Remote migration
versions not found in local migrations directory," even though the
remote database's migration history and schema were both genuinely
correct. The cause: two migration files used an 8-digit, date-only
version (`20260627_transaction_pattern_confirmations.sql`,
`20260701_family_pets_archive.sql`) instead of the full 14-digit
`YYYYMMDDHHMMSS` timestamp every other migration in the repo uses. The
CLI's version-matching logic couldn't reliably pair these short versions
against the remote history when a full-timestamp migration shared the
same date prefix (`20260627` sitting next to `20260627162021`, `20260701`
next to several `20260701xxxxxx` migrations) — a real CLI matching bug,
not a data problem. This was confirmed directly: `supabase_migrations
.schema_migrations` on the remote database had clean, correct rows for
both versions, exactly matching the local files by name, the whole time.

## What was fixed, and how

For each of the two affected migrations, in this order:

1. `supabase migration repair <old-version> --status reverted --linked`
   — removes only the old bookkeeping row. Confirmed beforehand (via the
   command's own `--help` output, which takes only a version and a
   status, with no way to pass or reference SQL) that `migration repair`
   has no mechanism to execute any SQL — it cannot touch actual schema.
2. Renamed the file to a 14-digit version using **midnight of the
   original date as the new timestamp** (`20260627000000`,
   `20260701000000`) — a defensible, consistently-ordered placeholder,
   not a claim to know the true original apply time, which isn't
   recoverable.
3. `supabase migration repair <new-version> --status applied --linked`
   — records the renamed version as applied.
4. `npm run db:migrations:status` — confirmed the old short version no
   longer appears anywhere, and the new version shows matched (both
   `local` and `remote` populated).
5. Re-ran the exact schema checks used during the original investigation
   — table existence, column existence, index existence, RLS policy
   existence — and confirmed byte-for-byte identical results before and
   after. Specifically: the `transaction_pattern_confirmations` table,
   its two indexes, and all four RLS policies; the `archived_at` columns
   on both `family_members` and `pets`, and their two indexes. **No
   actual database state changed at any point — only the bookkeeping
   labels in `supabase_migrations.schema_migrations`.**

## Confirmed fixed, not just worked around

Before the fix, `supabase db push --linked --dry-run` failed hard with
the matching error described above. After the fix, the same command
runs cleanly through the version-comparison logic and produces a
correct, expected result — proof the underlying bug is resolved, not
routed around:

- `supabase db push --linked --dry-run` correctly identifies that
  `20260314_ask_chat_persistence.sql` is chronologically out of order
  relative to already-applied migrations, and asks for `--include-all`
  to confirm — a real, sensible ordering safeguard, not a matching
  failure.
- `supabase db push --linked --dry-run --include-all` cleanly lists
  exactly the two genuinely pending migrations —
  `20260314_ask_chat_persistence.sql` and
  `20260716122340_income_confidence_tier.sql` — with no error and no
  mention of either renamed migration (correctly recognized as already
  applied and in sync).

`db push` is reliable again.

## Going forward: `20260314_ask_chat_persistence.sql`

This migration remains genuinely, intentionally unapplied. It creates
`ask_conversations`/`ask_messages`, part of a paused eight-source memory-
consolidation effort with no live code wiring anywhere in the app — see
`docs/product/paused-memory-consolidation.md` for the full reasoning on
why it's parked rather than pushed.

Practical consequence: **any future `supabase db push --linked` needs
`--include-all`** to get past this migration, since it will always be
chronologically behind whatever's already applied. Two real paths
forward, not resolved here:

- If the consolidation effort is revived, push it deliberately as part
  of that project (see the recommendation in
  `paused-memory-consolidation.md` — not one migration at a time).
- If the consolidation effort is truly abandoned, this migration should
  be formally deprecated or removed rather than left as permanent
  friction that every future push has to route around with
  `--include-all`.

## Credential hygiene

Never `grep`, `cat`, print, or otherwise output the raw contents of any
`.env*` file, or any command's output containing a live secret value —
a connection string, an API key, a JWT, a password. Check key **names**
and structure freely (existence, format, which files reference a name);
never display **values**. This session hit exactly this mistake twice —
once assuming a `KEY=VALUE` shape that a bare-URI file didn't actually
have (`.env.claude-readonly`), once grepping across `.env*` files
broadly enough to match a value instead of just a name
(`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) — both entirely avoidable
with a presence/name-only check instead of a raw content dump.

If a secret is ever accidentally printed in any tool output or pasted
into a chat conversation, **treat it as compromised immediately and
rotate it** — regardless of whether the surrounding channel seems
private, logged only locally, or already gitignored. Being gitignored
or never committed reduces exposure but does not undo it; the value
still left the file and entered a transcript. This applies to every
future credential encountered, not just the two from this session.
