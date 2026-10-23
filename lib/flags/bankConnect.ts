/**
 * Compile-time switch. An environment variable must not turn bank connections on.
 * Change this constant in source, then ship a new build, to enable them.
 */
export const BANK_CONNECT_ENABLED = false;

export const BANK_CONNECT_DISABLED_ERROR =
  "Bank connections are not part of this beta.";

/** Declared as boolean so callers do not treat the constant as dead code. */
export function bankConnectIsEnabled(): boolean {
  return BANK_CONNECT_ENABLED;
}
