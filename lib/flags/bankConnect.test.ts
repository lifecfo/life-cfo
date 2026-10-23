import assert from "node:assert/strict";
import test from "node:test";

import { BANK_CONNECT_ENABLED, bankConnectIsEnabled } from "./bankConnect";

test("bank connections are compiled off", () => {
  assert.equal(BANK_CONNECT_ENABLED, false);
  assert.equal(bankConnectIsEnabled(), false);
});
