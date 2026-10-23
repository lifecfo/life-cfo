import assert from "node:assert/strict";
import test from "node:test";

import { hiddenBetaDestination, isProtectedAppPath } from "./appPaths";
import { isLoggedOutEntryPath } from "./publicPaths";

test("the site root is a public landing and is not an app path", () => {
  assert.equal(isLoggedOutEntryPath("/"), true);
  assert.equal(isLoggedOutEntryPath("/login"), false);
  assert.equal(isProtectedAppPath("/"), false);
  assert.equal(isProtectedAppPath("/start"), true);
  assert.equal(hiddenBetaDestination("/money"), "/spending");
  assert.equal(hiddenBetaDestination("/money/year"), null);
  assert.equal(hiddenBetaDestination("/money/import"), null);
  assert.equal(hiddenBetaDestination("/money/setup"), "/start");
  assert.equal(hiddenBetaDestination("/connections"), "/start");
  assert.equal(hiddenBetaDestination("/investments"), "/lifecfo-home");
});
