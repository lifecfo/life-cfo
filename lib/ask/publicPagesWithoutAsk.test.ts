import test from "node:test";
import assert from "node:assert/strict";

import { shouldHideAsk } from "./publicPagesWithoutAsk";

test("hides Ask on every public, signed-out page", () => {
  for (const path of [
    "/",
    "/login",
    "/account-deleted",
    "/beta-invite",
    "/reset",
    "/auth/callback",
    "/auth/reset",
    "/privacy",
    "/terms",
    "/waitlist",
  ]) {
    assert.equal(shouldHideAsk(path), true, path);
  }
});

test("hides Ask on nested paths under a hidden prefix, not just the exact path", () => {
  assert.equal(shouldHideAsk("/beta-invite/anything"), true);
  assert.equal(shouldHideAsk("/privacy/old"), true);
});

test("shows Ask inside the signed-in app", () => {
  for (const path of ["/lifecfo-home", "/bills", "/money/year", "/household", "/settings", "/decisions"]) {
    assert.equal(shouldHideAsk(path), false, path);
  }
});

test("treats a missing pathname as hidden rather than guessing it's safe to show", () => {
  assert.equal(shouldHideAsk(null), true);
  assert.equal(shouldHideAsk(undefined), true);
  assert.equal(shouldHideAsk(""), true);
});
