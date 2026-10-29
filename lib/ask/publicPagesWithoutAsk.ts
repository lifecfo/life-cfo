/**
 * Pages where the floating Ask launcher/panel should never show. Ask only
 * makes sense inside the signed-in app -- these are the public, signed-out
 * surfaces (ClientProviders mounts AskLauncher/AskPanel globally, outside
 * AppShell, so they'd otherwise render everywhere including these).
 */
const ASK_HIDDEN_PREFIXES = ["/login", "/account-deleted", "/beta-invite", "/reset", "/auth", "/privacy", "/terms", "/waitlist"];

export function shouldHideAsk(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  return ASK_HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
