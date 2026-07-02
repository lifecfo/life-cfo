type AuthenticatedUserMetadata = {
  app_metadata?: unknown;
};

export type LifeCfoAccess = {
  isDemoMode: boolean;
  isDeveloper: boolean;
  canUseRealDataSources: boolean;
};

export function getLifeCfoAccess(user: AuthenticatedUserMetadata): LifeCfoAccess {
  const metadata =
    user.app_metadata && typeof user.app_metadata === "object"
      ? (user.app_metadata as Record<string, unknown>)
      : {};
  const access = metadata.lifecfo_access;
  const isDeveloper = access === "developer";
  const isDemoMode = !isDeveloper;

  return {
    isDemoMode,
    isDeveloper,
    canUseRealDataSources: isDeveloper,
  };
}

export const REAL_DATA_DISABLED_MESSAGE = "This demo uses sample data only.";
