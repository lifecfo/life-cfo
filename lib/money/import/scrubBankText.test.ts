import assert from "node:assert/strict";
import test from "node:test";

import { isNicknameOnly, scrubBankText } from "./scrubBankText";

test("bank text drops BSB and long account numbers", () => {
  assert.equal(scrubBankText("Rent 062-000 12345678"), "Rent");
  assert.equal(isNicknameOnly("Everyday"), true);
  assert.equal(isNicknameOnly("062-000"), false);
  assert.equal(isNicknameOnly("12345678"), false);
});
