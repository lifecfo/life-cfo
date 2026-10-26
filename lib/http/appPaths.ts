const PROTECTED_PREFIXES = [
  "/lifecfo-home",
  "/home",
  "/inbox",
  "/money",
  "/decisions",
  "/chapters",
  "/accounts",
  "/connections",
  "/bills",
  "/income",
  "/investments",
  "/budget",
  "/transactions",
  "/settings",
  "/how-life-cfo-works",
  "/fine-print",
  "/family",
  "/household",
  "/net-worth",
  "/liabilities",
  "/feedback",
  "/buffer",
  "/planned-upgrades",
  "/beta-invite",
  "/welcome",
  "/start",
  "/spending",
  "/engine",
  "/seed",
  "/lab",
  "/demo",
];

export const DEVELOPER_ONLY_PREFIXES = ["/engine", "/seed", "/lab", "/demo"];

export const BANK_TOOL_PREFIXES = ["/connections"];

export const INVITE_EXEMPT_PREFIXES = [
  "/beta-invite",
  "/privacy",
  "/terms",
  "/how-life-cfo-works",
  "/settings",
];

export function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedAppPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, PROTECTED_PREFIXES);
}

/** Older product pages. Signed-in people are sent to the beta equivalent. */
const HIDDEN_BETA_DESTINATIONS: Array<{ path: string; destination: string; exact?: boolean }> = [
  { path: "/money/setup", destination: "/start" },
  { path: "/money/map", destination: "/lifecfo-home" },
  { path: "/money/rules", destination: "/spending" },
  { path: "/money/categories", destination: "/spending" },
  { path: "/money/in", destination: "/spending" },
  { path: "/money/out", destination: "/spending" },
  { path: "/money/saved", destination: "/lifecfo-home" },
  { path: "/money/planned", destination: "/lifecfo-home" },
  { path: "/money", destination: "/spending", exact: true },
  { path: "/transactions", destination: "/spending" },
  { path: "/connections", destination: "/start" },
  { path: "/net-worth", destination: "/lifecfo-home" },
  { path: "/liabilities", destination: "/lifecfo-home" },
  { path: "/investments", destination: "/lifecfo-home" },
  { path: "/chapters", destination: "/lifecfo-home" },
  { path: "/buffer", destination: "/lifecfo-home" },
  { path: "/planned-upgrades", destination: "/lifecfo-home" },
  { path: "/family", destination: "/household" },
  { path: "/inbox", destination: "/lifecfo-home" },
];

export function hiddenBetaDestination(pathname: string): string | null {
  for (const entry of HIDDEN_BETA_DESTINATIONS) {
    const matches = entry.exact
      ? pathname === entry.path
      : pathname === entry.path || pathname.startsWith(`${entry.path}/`);
    if (matches) return entry.destination;
  }
  return null;
}
