import assert from "node:assert/strict";
import test from "node:test";

import { isProtectedAppPath } from "./appPaths";
import { isLoggedOutEntryPath } from "./publicPaths";

test("the site root is a public landing and is not an app path", () => {
  assert.equal(isLoggedOutEntryPath("/"), true);
  assert.equal(isLoggedOutEntryPath("/login"), false);
  assert.equal(isProtectedAppPath("/"), false);
  assert.equal(isProtectedAppPath("/start"), true);
});
