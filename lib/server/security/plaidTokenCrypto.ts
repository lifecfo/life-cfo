import {
  decryptPlaidToken as decryptToken,
  encryptPlaidToken as encryptToken,
  isEncryptedPlaidToken as isEncryptedToken,
  type PlaidTokenContext,
} from "./plaidTokenCryptoCore.mjs";

export type { PlaidTokenContext };

export function encryptPlaidToken(
  token: string,
  context: PlaidTokenContext
): string {
  return encryptToken(token, context);
}

export function decryptPlaidToken(
  envelope: string,
  context: PlaidTokenContext
): string {
  return decryptToken(envelope, context);
}

export function isEncryptedPlaidToken(value: unknown): boolean {
  return isEncryptedToken(value);
}
