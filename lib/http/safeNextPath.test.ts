import assert from "node:assert/strict";
import test from "node:test";

import { safeNextPath } from "./safeNextPath";

test("keeps a same-site path and query", () => {
  assert.equal(safeNextPath("/money/setup?step=1"), "/money/setup?step=1");
});

test("rejects off-site and protocol-relative redirects", () => {
  assert.equal(safeNextPath("https://evil.example/steal"), "/home");
  assert.equal(safeNextPath("//evil.example"), "/home");
  assert.equal(safeNextPath("/\\evil"), "/home");
  assert.equal(safeNextPath("https://life-cfo.local\\@evil"), "/home");
  assert.equal(safeNextPath("/login?next=http://evil.example"), "/home");
});

test("rejects credentials and control characters", () => {
  assert.equal(safeNextPath("/money\n/../admin"), "/home");
  assert.equal(safeNextPath("not-a-path"), "/home");
  assert.equal(safeNextPath(null), "/home");
});
