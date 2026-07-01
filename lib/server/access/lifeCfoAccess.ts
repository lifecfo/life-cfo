type AuthenticatedUserMetadata = {
  app_metadata?: unknown;
};

export type LifeCfoAccess = {
  isDemoBeta: boolean;
  isDeveloper: boolean;
  canUseRealDataSources: boolean;
};

export function getLifeCfoAccess(user: AuthenticatedUserMetadata): LifeCfoAccess {
  const metadata =
    user.app_metadata && typeof user.app_metadata === "object"
      ? (user.app_metadata as Record<string, unknown>)
      : {};
  const access = metadata.lifecfo_access;
  const isDemoBeta = access === "demo_beta";
  const isDeveloper = access === "developer";

  return {
    isDemoBeta,
    isDeveloper,
    canUseRealDataSources: isDeveloper,
  };
}

export const REAL_DATA_DISABLED_MESSAGE = "This demo uses sample data only.";
