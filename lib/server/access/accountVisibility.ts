const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccountVisibilityRow = {
  user_id?: string | null;
  visibility?: string | null;
};

/** Own accounts, plus accounts the household has marked shared. */
export function isAccountVisibleToUser(row: AccountVisibilityRow, viewerUserId: string): boolean {
  if (!viewerUserId) return false;
  if (row.user_id && row.user_id === viewerUserId) return true;
  return String(row.visibility || "").trim().toLowerCase() === "shared";
}

/** PostgREST `or` filter. Caller must pass an authenticated user id, never search text. */
export function visibleAccountsOrFilter(viewerUserId: string): string {
  if (!USER_ID.test(viewerUserId)) {
    throw new Error("Invalid user id");
  }
  return `user_id.eq.${viewerUserId},visibility.eq.shared`;
}
