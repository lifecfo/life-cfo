import { bankConnectIsEnabled } from "@/lib/flags/bankConnect";

type AuthenticatedUserMetadata = {
  app_metadata?: unknown;
  email?: string | null;
};

export type LifeCfoAccess = {
  isDemoMode: boolean;
  isDeveloper: boolean;
  canUseRealDataSources: boolean;
  canAddManualAccounts: boolean;
};

function metadataRecord(user: AuthenticatedUserMetadata): Record<string, unknown> {
  return user.app_metadata && typeof user.app_metadata === "object"
    ? (user.app_metadata as Record<string, unknown>)
    : {};
}

export function isDeveloperUser(user: AuthenticatedUserMetadata): boolean {
  return metadataRecord(user).lifecfo_access === "developer";
}

export function hasInviteMetadata(user: AuthenticatedUserMetadata): boolean {
  return metadataRecord(user).lifecfo_invited === true;
}

/**
 * Typed-household beta.
 * Bank feeds stay compiled off. A CSV the person uploads is separate.
 * Manual accounts (name + balance, no account numbers) are not a bank
 * connection and stay available regardless of canUseRealDataSources.
 * Demo households are not forced onto invitees.
 */
export function getLifeCfoAccess(user: AuthenticatedUserMetadata): LifeCfoAccess {
  const isDeveloper = isDeveloperUser(user);
  return {
    isDemoMode: false,
    isDeveloper,
    canUseRealDataSources: bankConnectIsEnabled() && isDeveloper,
    canAddManualAccounts: true,
  };
}

export const REAL_DATA_DISABLED_MESSAGE =
  "Bank connections are not part of this beta.";
