export type DataTable = {
  table: string;
  userIdColumn?: "user_id";
  householdIdColumn?: "household_id";
};

/**
 * User-owned tables for export and account deletion.
 * A migration test fails if a new table with user_id or household_id is missing here.
 */
export const DATA_TABLES: readonly DataTable[] = [
  { table: "ask_messages", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "ask_conversations", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "source_lifecycle_jobs", householdIdColumn: "household_id" },
  { table: "transaction_pattern_confirmations", householdIdColumn: "household_id" },
  { table: "money_bucket_allocations", householdIdColumn: "household_id" },
  { table: "money_buckets", userIdColumn: "user_id", householdIdColumn: "household_id" },
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
  { table: "decision_inbox", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "liabilities", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "investment_accounts", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "household_preferences", householdIdColumn: "household_id" },
  { table: "household_invites", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "home_status_runs", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "home_status_latest", userIdColumn: "user_id" },
  { table: "engine_runs", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "legal_acceptances", userIdColumn: "user_id" },
  { table: "beta_access", userIdColumn: "user_id" },
  { table: "profiles", userIdColumn: "user_id" },
  { table: "household_members", userIdColumn: "user_id", householdIdColumn: "household_id" },
  { table: "households" },
] as const;

export function registeredTableNames(): string[] {
  return DATA_TABLES.map((entry) => entry.table);
}
