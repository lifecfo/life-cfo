export type PlaidTokenContext = {
  provider: "plaid";
  household_id: string;
  connection_id: string;
};

export function encryptPlaidToken(
  token: string,
  context: PlaidTokenContext
): string;

export function decryptPlaidToken(
  envelope: string,
  context: PlaidTokenContext
): string;

export function isEncryptedPlaidToken(value: unknown): boolean;
