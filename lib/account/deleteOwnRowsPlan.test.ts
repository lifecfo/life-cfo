import test from "node:test";
import assert from "node:assert/strict";

import type { DataTable } from "./dataRegistry";
import { planDeleteOwnRows } from "./deleteOwnRowsPlan";
import { soleMemberHouseholdIds, type DeletionMembership } from "./deletionPlan";

test("a table with no user_id column is left alone by the per-user step", () => {
  assert.equal(planDeleteOwnRows({ table: "households" }), null);
  assert.equal(planDeleteOwnRows({ table: "household_items", householdIdColumn: "household_id" }), null);
});

test("a purely personal table (no household_id) deletes by user_id alone", () => {
  assert.deepEqual(planDeleteOwnRows({ table: "profiles", userIdColumn: "user_id" }), {
    kind: "by_user_only",
  });
});

test("a table scoped to a household only targets the user's rows with no household at all", () => {
  assert.deepEqual(
    planDeleteOwnRows({ table: "bills", userIdColumn: "user_id", householdIdColumn: "household_id" }),
    { kind: "by_user_and_household_null" }
  );
});

// Simulates app/api/delete-account/route.ts's actual two-step algorithm
// (household loop gated by soleMemberHouseholdIds, then the per-user step
// gated by planDeleteOwnRows) against an in-memory fixture, using the exact
// same two functions the real route calls. No database involved.
function wouldRowSurvive(
  table: DataTable,
  row: Record<string, unknown>,
  deletingUserId: string,
  memberships: DeletionMembership[]
): boolean {
  const householdsBeingDeleted = new Set(soleMemberHouseholdIds(memberships));

  if (table.householdIdColumn) {
    const householdId = row[table.householdIdColumn];
    if (typeof householdId === "string" && householdsBeingDeleted.has(householdId)) {
      return false; // the whole household is being deleted
    }
  }

  const plan = planDeleteOwnRows(table);
  if (!plan) return true; // per-user step never touches this table
  if (row[table.userIdColumn!] !== deletingUserId) return true; // not this user's row
  if (plan.kind === "by_user_only") return false;
  // by_user_and_household_null: the per-user step only deletes an unattached
  // row (household_id IS NULL) -- a row tied to a household survives here.
  return row[table.householdIdColumn!] != null;
}

test("two-member household: one member deletes their account, the other member's bills/categories/budget items survive", () => {
  const SHARED_HOUSEHOLD = "household-shared";
  const LEAVING_USER = "user-leaving";
  const REMAINING_USER = "user-remaining";

  const memberships: DeletionMembership[] = [
    {
      household_id: SHARED_HOUSEHOLD,
      household_name: "Shared household",
      role: "editor",
      member_count: 2,
      owner_count: 1,
      active_bank_connections: 0,
      active_lifecycle_jobs: 0,
    },
  ];

  const billsTable = { table: "bills", userIdColumn: "user_id" as const, householdIdColumn: "household_id" as const };
  const categoriesTable = {
    table: "categories",
    userIdColumn: "user_id" as const,
    householdIdColumn: "household_id" as const,
  };
  const budgetItemsTable = {
    table: "budget_items",
    userIdColumn: "user_id" as const,
    householdIdColumn: "household_id" as const,
  };

  const theirBill = { id: "bill-1", user_id: LEAVING_USER, household_id: SHARED_HOUSEHOLD };
  const theirCategory = { id: "cat-1", user_id: LEAVING_USER, household_id: SHARED_HOUSEHOLD };
  const theirBudgetItem = { id: "budget-1", user_id: LEAVING_USER, household_id: SHARED_HOUSEHOLD };

  assert.equal(wouldRowSurvive(billsTable, theirBill, LEAVING_USER, memberships), true);
  assert.equal(wouldRowSurvive(categoriesTable, theirCategory, LEAVING_USER, memberships), true);
  assert.equal(wouldRowSurvive(budgetItemsTable, theirBudgetItem, LEAVING_USER, memberships), true);

  // Sanity check the fixture against the inverse case: the household loop
  // DOES remove the same shape of row when this user is the SOLE member.
  const soleMemberships: DeletionMembership[] = [
    { ...memberships[0], member_count: 1 },
  ];
  assert.equal(wouldRowSurvive(billsTable, theirBill, LEAVING_USER, soleMemberships), false);

  // And the remaining member's own row in the same shared household is
  // untouched either way -- it was never this user's row to begin with.
  const theirCoMembersBill = { id: "bill-2", user_id: REMAINING_USER, household_id: SHARED_HOUSEHOLD };
  assert.equal(wouldRowSurvive(billsTable, theirCoMembersBill, LEAVING_USER, memberships), true);
});
