import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { LEGAL_UPDATED, legalPackCanonicalText } from "./betaLegalCopy";

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("legal text is final and does not say it is waiting on a lawyer", () => {
  const text = legalPackCanonicalText();
  assert.match(text, new RegExp(LEGAL_UPDATED));
  assert.match(text, /admin@life-cfo\.com/);
  assert.match(text, /18 or older/);
  assert.match(text, /Australia/);
  assert.match(text, /National Debt Helpline/);
  assert.match(text, /moneysmart\.gov\.au/);
  assert.match(text, /Australian Consumer Law/);
  assert.doesNotMatch(text, /lawyer/i);
  assert.doesNotMatch(text, /draft/i);
  assert.doesNotMatch(text, /pending review/i);
});

test("changing the legal text changes the acceptance hash", () => {
  const text = legalPackCanonicalText();
  const hash = sha256(text);
  assert.equal(hash.length, 64);
  assert.notEqual(sha256(`${text}\n`), hash);
});
