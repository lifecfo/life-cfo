export type HouseholdItem = { id: string; name: string; role: string };

export type HouseholdsLoadOutcome =
  | { kind: "unauthenticated" }
  | {
      kind: "loaded";
      households: HouseholdItem[];
      active_household_id: string | null;
      needs_household: boolean;
    }
  | { kind: "failed" };

/**
 * What AppShell should do with a response from GET /api/households.
 *
 * A 401 here means the session on this request isn't valid -- including a
 * JWT that still decodes locally (so middleware's lighter getClaims() check
 * let the request through) but whose user no longer exists, e.g. right
 * after account deletion if the client session was never signed out. That
 * case should send the visitor to /login, not render the app shell around
 * a page that discovers "not signed in" on its own.
 */
export function resolveHouseholdsLoadOutcome(status: number, json: unknown): HouseholdsLoadOutcome {
  if (status === 401) return { kind: "unauthenticated" };

  const body = json as { ok?: boolean; households?: unknown; active_household_id?: unknown; needs_household?: unknown } | null;
  if (!body?.ok) return { kind: "failed" };

  return {
    kind: "loaded",
    households: Array.isArray(body.households) ? (body.households as HouseholdItem[]) : [],
    active_household_id: typeof body.active_household_id === "string" ? body.active_household_id : null,
    needs_household: !!body.needs_household,
  };
}
