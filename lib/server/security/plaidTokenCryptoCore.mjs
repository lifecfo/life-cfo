import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENVELOPE_PREFIX = "lcfo:plaid";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_TOKEN_BYTES = 8 * 1024;
const MAX_ENVELOPE_LENGTH = 16 * 1024;
const VERSION_PATTERN = /^v[1-9][0-9]*$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertContext(context) {
  if (
    !context ||
    context.provider !== "plaid" ||
    typeof context.household_id !== "string" ||
    !context.household_id.trim() ||
    typeof context.connection_id !== "string" ||
    !context.connection_id.trim()
  ) {
    throw fail("plaid_token_context_invalid");
  }
}

function activeVersion() {
  const version = String(
    process.env.PLAID_TOKEN_ENCRYPTION_ACTIVE_VERSION || ""
  ).trim();
  if (!VERSION_PATTERN.test(version)) {
    throw fail("plaid_token_key_unavailable");
  }
  return version;
}

function keyForVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw fail("plaid_token_envelope_invalid");
  }
  const encoded = String(
    process.env[`PLAID_TOKEN_ENCRYPTION_KEY_${version.toUpperCase()}`] || ""
  ).trim();
  if (!encoded || !BASE64_PATTERN.test(encoded)) {
    throw fail("plaid_token_key_unavailable");
  }

  let key;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    throw fail("plaid_token_key_unavailable");
  }
  if (key.length !== KEY_BYTES) {
    throw fail("plaid_token_key_unavailable");
  }
  if (key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw fail("plaid_token_key_unavailable");
  }
  return key;
}

function decodePart(value, expectedBytes = null) {
  if (!BASE64URL_PATTERN.test(value)) {
    throw fail("plaid_token_envelope_invalid");
  }
  const decoded = Buffer.from(value, "base64url");
  if (!decoded.length || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    throw fail("plaid_token_envelope_invalid");
  }
  return decoded;
}

function parseEnvelope(value) {
  if (typeof value !== "string" || value.length > MAX_ENVELOPE_LENGTH) {
    throw fail("plaid_token_envelope_invalid");
  }
  const parts = value.split(":");
  if (
    parts.length !== 6 ||
    parts[0] !== "lcfo" ||
    parts[1] !== "plaid" ||
    !VERSION_PATTERN.test(parts[2])
  ) {
    throw fail("plaid_token_envelope_invalid");
  }

  return {
    version: parts[2],
    iv: decodePart(parts[3], IV_BYTES),
    authTag: decodePart(parts[4], AUTH_TAG_BYTES),
    ciphertext: decodePart(parts[5]),
  };
}

function aad(context, version) {
  assertContext(context);
  return Buffer.from(
    JSON.stringify({
      provider: "plaid",
      household_id: context.household_id,
      connection_id: context.connection_id,
      version,
    }),
    "utf8"
  );
}

export function isEncryptedPlaidToken(value) {
  try {
    parseEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

export function encryptPlaidToken(token, context) {
  if (
    typeof token !== "string" ||
    !token.trim() ||
    Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES
  ) {
    throw fail("plaid_token_unavailable");
  }
  assertContext(context);

  const version = activeVersion();
  const key = keyForVersion(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context, version));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    version,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptPlaidToken(envelope, context) {
  assertContext(context);
  const parsed = parseEnvelope(envelope);
  const key = keyForVersion(parsed.version);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, parsed.iv);
    decipher.setAAD(aad(context, parsed.version));
    decipher.setAuthTag(parsed.authTag);
    const plaintext = Buffer.concat([
      decipher.update(parsed.ciphertext),
      decipher.final(),
    ]).toString("utf8");
    if (!plaintext) throw fail("plaid_token_unavailable");
    return plaintext;
  } catch {
    throw fail("plaid_token_unavailable");
  }
}
