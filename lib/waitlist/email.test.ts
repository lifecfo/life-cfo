import assert from "node:assert/strict";
import test from "node:test";

import { normaliseWaitlistEmail } from "./email";

test("waitlist email is trimmed and rejected when it is not an email", () => {
  assert.equal(normaliseWaitlistEmail("  Person@Example.com "), "person@example.com");
  assert.equal(normaliseWaitlistEmail("not-an-email"), null);
  assert.equal(normaliseWaitlistEmail(""), null);
});
