import assert from "node:assert/strict";
import test from "node:test";

import { parseHouseholdSheet, SHEET_TEMPLATE } from "./sheetRows";

test("the household spreadsheet template becomes confirmable rows", () => {
  const parsed = parseHouseholdSheet(SHEET_TEMPLATE);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.rows[0]?.title, "Rent");
  assert.equal(parsed.rows[0]?.kind, "bill");
  assert.equal(parsed.rows[0]?.amount_cents, 45000);
  assert.equal(parsed.rows[0]?.due_on, "2026-11-01");
  assert.match(parsed.rows[0]?.notes ?? "", /monthly/);
  assert.equal(parsed.rows[1]?.kind, "income");
});
