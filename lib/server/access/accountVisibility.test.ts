import assert from "node:assert/strict";
import test from "node:test";

import { isAccountVisibleToUser, visibleAccountsOrFilter } from "./accountVisibility";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("the owner can see a private account", () => {
  assert.equal(isAccountVisibleToUser({ user_id: VIEWER, visibility: "private" }, VIEWER), true);
});

test("another member sees a shared account and not a private one", () => {
  assert.equal(isAccountVisibleToUser({ user_id: OTHER, visibility: "shared" }, VIEWER), true);
  assert.equal(isAccountVisibleToUser({ user_id: OTHER, visibility: "private" }, VIEWER), false);
  assert.equal(isAccountVisibleToUser({ user_id: OTHER, visibility: "balance_only" }, VIEWER), false);
});

test("the account filter is built only from a user id", () => {
  assert.equal(
    visibleAccountsOrFilter(VIEWER),
    `user_id.eq.${VIEWER},visibility.eq.shared`
  );
  assert.throws(() => visibleAccountsOrFilter("name.ilike.%"), /Invalid user id/);
});
