type AuthenticatedUserMetadata = {
  app_metadata?: unknown;
  email?: string | null;
};

export type LifeCfoAccess = {
  isDemoMode: boolean;
  isDeveloper: boolean;
  canUseRealDataSources: boolean;
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
 * Bank feeds, CSV upload, and manual bank accounts stay developer-only.
 * Demo households are not forced onto invitees.
 */
export function getLifeCfoAccess(user: AuthenticatedUserMetadata): LifeCfoAccess {
  const isDeveloper = isDeveloperUser(user);
  return {
    isDemoMode: false,
    isDeveloper,
    canUseRealDataSources: isDeveloper,
  };
}

export const REAL_DATA_DISABLED_MESSAGE =
  "Bank connections and bank-file upload are not part of this beta.";
