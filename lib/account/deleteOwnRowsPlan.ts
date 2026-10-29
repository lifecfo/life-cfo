import type { DataTable } from "./dataRegistry";

export type DeleteOwnRowsFilter =
  | { kind: "by_user_only" }
  | { kind: "by_user_and_household_null" };

/**
 * How to delete a user's OWN rows from a table, for households that are NOT
 * being deleted outright (that's handled separately -- see
 * soleMemberHouseholdIds in deletionPlan.ts and the household loop in
 * app/api/delete-account/route.ts, which only ever targets a household
 * where this user is the sole member).
 *
 * A table scoped to a household belongs to that household, not to any one
 * member: a bill, category, or decision a user created inside a household
 * they share with other people must stay for those people after the creator
 * deletes their own account. So for a table with a household_id column,
 * only this user's rows that have NO household at all (never shared) should
 * go here -- household-attached rows are either already covered by the
 * sole-member household loop, or belong to a still-active shared household
 * and must be left alone.
 *
 * Returns null for a table with no user_id column at all (nothing to do in
 * the per-user step; it either has no personal data, or it's handled
 * entirely by the household loop).
 */
export function planDeleteOwnRows(table: DataTable): DeleteOwnRowsFilter | null {
  if (!table.userIdColumn) return null;
  return table.householdIdColumn ? { kind: "by_user_and_household_null" } : { kind: "by_user_only" };
}
