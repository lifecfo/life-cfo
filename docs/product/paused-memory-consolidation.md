# Paused memory consolidation effort

Read-only finding from a database-migration audit session. No action taken,
no migration touched. Documenting so this isn't rediscovered from scratch
or accidentally completed piecemeal.

## What exists

`lib/memory/compat/` contains real adapter code — TypeScript row-shape
types (`compat/types.ts`) and pure mapper functions (`compat/adapters.ts`)
— built to translate eight legacy tables/sources into the unified Memory
contract shape defined in `lib/memory/contracts.ts` (`EphemeralThread`,
`EphemeralMessage`, `DurableDecisionDTO`, `LegacyInsightLikeDTO`,
`RevisitSignalLikeDTO`, etc.).

The eight legacy sources covered by this compat layer
(`MemoryLegacySource` in `compat/types.ts`):

1. `ask_conversations`
2. `ask_messages`
3. `decision_conversations`
4. `decision_summaries`
5. `decisions`
6. `decision_inbox`
7. `home_status_runs`
8. `home_status_latest`

## What's actually wired up: none of it

Checked every real usage of the compat layer's mapper functions
(`mapAskConversationToEphemeralThread`, etc.) across the codebase — zero
matches outside `lib/memory/compat/` itself. `compat/index.ts` re-exports
everything, but nothing imports from that index file either. The five
real application files that do import from `@/lib/memory`
(`app/api/ai/conversation/route.ts`, `components/ask/AskProvider.tsx`,
`components/ask/AskPanel.tsx`, `app/(app)/decisions/ConversationPanel.tsx`,
`app/api/memory/promote/route.ts`) all import from `lib/memory/contracts.ts`
directly — none of them touch `lib/memory/compat/` at all.

Live Ask already works entirely through `contracts.ts`'s types directly,
and is ephemeral by default in the product itself ("Temporary by default.
Save only if you choose," per the live UI copy) — it doesn't currently
need persisted conversation history to function.

## Migration coverage: only 1 of 8 sources has a migration file at all

`supabase/migrations/` contains exactly one migration referencing any of
these eight sources: `20260314_ask_chat_persistence.sql`, which creates
`ask_conversations` and `ask_messages` (tables 1-2 above). It is
genuinely unapplied — confirmed by direct query against the remote
database: no row in `supabase_migrations.schema_migrations` for that
version, and the tables themselves don't exist.

**The other seven sources' migration status was not checked as part of
this finding.** `decisions`, `decision_inbox`, `decision_conversations`,
`decision_summaries`, `home_status_runs`, and `home_status_latest` may
never have had migrations written for them in this repo at all (several
of these read like they could predate migration tracking, similar to
how `external_connections_token_required_check`'s original constraint
turned out to predate every tracked migration), or their migrations may
exist under different, less discoverable filenames. Not verified either
way.

## Recommendation

**Don't push `20260314_ask_chat_persistence.sql` in isolation.** It's the
only one of the eight sources with a ready-to-push migration, but pushing
it alone would create two tables for a consolidation effort that:
- has no wiring to any live code for any of its eight sources, not just
  these two,
- has six other sources whose own migration status is unknown, and
- appears to be a paused, partially-scaffolded refactor rather than a
  feature someone forgot to finish deploying (see the fuller reasoning
  in the session that produced this finding — the compat layer's shape
  and the existence of a real, working ephemeral alternative for Ask
  both point to "abandoned mid-effort," not "actively blocked by a
  missing migration").

If this consolidation is worth reviving, it should be resumed as its own
deliberate project scoped across all eight sources together — auditing
each source's actual migration state, deciding whether the compat layer
is still the right design, and wiring it into live code as a whole — not
completed accidentally, one migration at a time, starting with whichever
one happens to already have a ready SQL file sitting in the repo.
