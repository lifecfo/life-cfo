import { safeNextPath } from "./safeNextPath";

/**
 * Where to send a user right after they accept the fine print.
 * A user with no household yet always goes to /household, regardless of
 * nextPath -- any other destination would just get them bounced there by
 * AppShell's own household gate a moment later.
 */
export function resolvePostFinePrintDestination(
  nextPath: string | null | undefined,
  needsHousehold: boolean
): string {
  if (needsHousehold) return "/household";

  const dest = safeNextPath(nextPath || "/home");
  return dest === "/home" ? "/start" : dest;
}
