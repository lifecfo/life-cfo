export type DataTable = {
  table: string;
  userIdColumn?: "user_id";
  householdIdColumn?: "household_id";
};

/**
 * User-owned tables for export and account deletion.
 * A migration test fails if a new table with user_id or household_id is missing here.
 *
 * Every column reference below was checked against the live schema (not just
 * migration files, since several tables here predate migration tracking).
 * ask_messages/ask_conversations are from a migration that was deliberately
 * never applied (see docs/product/paused-memory-consolidation.md) -- they
 * don't exist yet, but stay registered so the migration-coverage test below
 * still catches them if that migration is ever applied without updating this
 * list. Account deletion already tolerates a table or column that doesn't
 * exist (see missingRelation() in app/api/delete-account/route.ts), so their
 * absence today is a harmless no-op, not a bug.
 */
export const DATA_TABLES: readonly DataTable[] = [
  { table: "ask_messages", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "ask_conversations", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "source_lifecycle_jobs", householdIdColumn: "household_id" },
  { table: "transaction_pattern_confirmations", householdIdColumn: "household_id" },
  { table: "money_bucket_allocations", householdIdColumn: "household_id" },
  // money_buckets has no user_id column (household_id only) -- a stray
  // userIdColumn here always failed with "column does not exist" and was
  // silently swallowed by missingRelation().
  { table: "money_buckets", householdIdColumn: "household_id" },
  { table: "money_goal_updates", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "money_goal_accounts", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "money_goals", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "transactions", householdIdColumn: "household_id" },
  { table: "accounts", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "external_accounts", householdIdColumn: "household_id" },
  { table: "external_connections", householdIdColumn: "household_id" },
  { table: "recurring_bills", householdIdColumn: "household_id" },
  { table: "recurring_income", householdIdColumn: "household_id" },
  { table: "family_members", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "pets", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decisions", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_summaries", userIdColumn: "user_id", householdIdColumn: "household_id" },
  // decision_inbox has no household_id column (user_id only) -- captures are
  // always personal (see lib/capture/useCaptureSubmit.ts), never shared.
  { table: "decision_inbox", userIdColumn: "user_id" },
  { table: "liabilities", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "investment_accounts", userIdColumn: "user_id", householdIdColumn: "household_id" },
  // household_preferences has no household_id column -- its household
  // reference is named active_household_id, which this registry's DataTable
  // type doesn't model. user_id is the real owning column.
  { table: "household_preferences", userIdColumn: "user_id" },
  // household_invites has no user_id column -- the inviter is invited_by,
  // and the invite belongs to the household either way.
  { table: "household_invites", householdIdColumn: "household_id" },
  { table: "household_reminder_reads", userIdColumn: "user_id" },
  { table: "household_reminders", householdIdColumn: "household_id" },
  { table: "household_items", householdIdColumn: "household_id" },
  { table: "household_receipts", householdIdColumn: "household_id" },
  { table: "usage_events", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "ai_usage_daily", userIdColumn: "user_id" },
  // home_status_runs has no household_id column (user_id only).
  // home_status_latest, previously listed here too, is a VIEW -- deleting
  // from it fails with "cannot delete from view ...". It has no rows of its
  // own; it's just "latest row per user" over home_status_runs, which this
  // entry already deletes from directly.
  { table: "home_status_runs", userIdColumn: "user_id" },
  { table: "engine_runs", userIdColumn: "user_id" },
  { table: "legal_acceptances", userIdColumn: "user_id" },
  { table: "beta_access", userIdColumn: "user_id" },
  { table: "profiles", userIdColumn: "user_id" },
  { table: "household_members", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "households" },

  // The tables below were found missing from this registry by cross-checking
  // it against the live schema's user_id/household_id columns directly
  // (the migration-coverage test only sees tables created via a tracked
  // `create table`, so it can't catch a pre-tracking table like these).
  { table: "bill_payments", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "bills", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "budget_items", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "categories", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "categorisation_rules", householdIdColumn: "household_id" },
  { table: "constellation_items", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "constellations", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_analysis", userIdColumn: "user_id" },
  { table: "decision_attachments", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_conversations", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_domains", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_links", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_notes", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "decision_shares", householdIdColumn: "household_id" },
  { table: "demo_seed_runs", userIdColumn: "user_id" },
  { table: "domain_constellations", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "domains", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "engine_insights", userIdColumn: "user_id" },
  { table: "feedback", userIdColumn: "user_id" },
  { table: "recurring_patterns", userIdColumn: "user_id", householdIdColumn: "household_id" },
] as const;

export function registeredTableNames(): string[] {
  return DATA_TABLES.map((entry) => entry.table);
}
