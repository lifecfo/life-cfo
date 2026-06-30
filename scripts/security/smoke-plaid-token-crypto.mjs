import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import {
  decryptPlaidToken,
  encryptPlaidToken,
  isEncryptedPlaidToken,
} from "../../lib/server/security/plaidTokenCryptoCore.mjs";

const previousVersion = process.env.PLAID_TOKEN_ENCRYPTION_ACTIVE_VERSION;
const previousKey = process.env.PLAID_TOKEN_ENCRYPTION_KEY_V1;
const context = {
  provider: "plaid",
  household_id: "00000000-0000-4000-8000-000000000001",
  connection_id: "00000000-0000-4000-8000-000000000002",
};

try {
  process.env.PLAID_TOKEN_ENCRYPTION_ACTIVE_VERSION = "v1";
  process.env.PLAID_TOKEN_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64");

  const envelope = encryptPlaidToken("synthetic-test-token", context);
  assert.equal(isEncryptedPlaidToken(envelope), true);
  assert.equal(isEncryptedPlaidToken("synthetic-test-token"), false);
  assert.equal(decryptPlaidToken(envelope, context), "synthetic-test-token");
  assert.throws(() =>
    decryptPlaidToken(envelope, { ...context, connection_id: "different" })
  );
  assert.throws(() => decryptPlaidToken("malformed", context));

  delete process.env.PLAID_TOKEN_ENCRYPTION_KEY_V1;
  assert.throws(() => encryptPlaidToken("synthetic-test-token", context));

  console.log("Plaid token crypto smoke checks passed.");
} finally {
  if (previousVersion === undefined) {
    delete process.env.PLAID_TOKEN_ENCRYPTION_ACTIVE_VERSION;
  } else process.env.PLAID_TOKEN_ENCRYPTION_ACTIVE_VERSION = previousVersion;
  if (previousKey === undefined) delete process.env.PLAID_TOKEN_ENCRYPTION_KEY_V1;
  else process.env.PLAID_TOKEN_ENCRYPTION_KEY_V1 = previousKey;
}
