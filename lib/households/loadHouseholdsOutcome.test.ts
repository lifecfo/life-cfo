import test from "node:test";
import assert from "node:assert/strict";

import { resolveHouseholdsLoadOutcome } from "./loadHouseholdsOutcome";

test("a 401 means the session is invalid, regardless of body shape", () => {
  assert.deepEqual(resolveHouseholdsLoadOutcome(401, { ok: false, error: "Not signed in." }), {
    kind: "unauthenticated",
  });
  assert.deepEqual(resolveHouseholdsLoadOutcome(401, null), { kind: "unauthenticated" });
  assert.deepEqual(resolveHouseholdsLoadOutcome(401, { ok: true }), { kind: "unauthenticated" });
});

test("a successful response loads households, active id, and needs_household", () => {
  assert.deepEqual(
    resolveHouseholdsLoadOutcome(200, {
      ok: true,
      households: [{ id: "h1", name: "Home", role: "owner" }],
      active_household_id: "h1",
      needs_household: false,
    }),
    {
      kind: "loaded",
      households: [{ id: "h1", name: "Home", role: "owner" }],
      active_household_id: "h1",
      needs_household: false,
    }
  );
});

test("a successful response with no households yet reports needs_household", () => {
  assert.deepEqual(resolveHouseholdsLoadOutcome(200, { ok: true, households: [], active_household_id: null, needs_household: true }), {
    kind: "loaded",
    households: [],
    active_household_id: null,
    needs_household: true,
  });
});

test("a non-401 failure (ok: false, or malformed body) is reported as failed, not unauthenticated", () => {
  assert.deepEqual(resolveHouseholdsLoadOutcome(500, { ok: false, error: "boom" }), { kind: "failed" });
  assert.deepEqual(resolveHouseholdsLoadOutcome(200, null), { kind: "failed" });
  assert.deepEqual(resolveHouseholdsLoadOutcome(200, {}), { kind: "failed" });
});
