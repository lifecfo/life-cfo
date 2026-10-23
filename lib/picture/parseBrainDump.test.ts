import assert from "node:assert/strict";
import test from "node:test";

import { parseBrainDump } from "./parseBrainDump";

const now = new Date("2026-10-23T00:00:00.000Z");

test("a brain dump line keeps the amount and date that were typed", () => {
  const [item] = parseBrainDump("rent $450 fortnightly due 2026-11-01", now);
  assert.equal(item.kind, "bill");
  assert.equal(item.amount_cents, 45000);
  assert.equal(item.due_on, "2026-11-01");
  assert.match(item.title, /rent/i);
});

test("a renewal line is labelled as a renewal", () => {
  const [item] = parseBrainDump("rego renewal 12 Nov $320", now);
  assert.equal(item.kind, "renewal");
  assert.equal(item.amount_cents, 32000);
  assert.equal(item.due_on, "2026-11-12");
});

test("an empty brain dump has no items", () => {
  assert.deepEqual(parseBrainDump("  \n", now), []);
});
