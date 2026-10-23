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
  "/engine",
  "/seed",
  "/lab",
  "/demo",
];

export const DEVELOPER_ONLY_PREFIXES = ["/engine", "/seed", "/lab", "/demo"];

export const BANK_TOOL_PREFIXES = ["/connections", "/money/import", "/money/accounts/new"];

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
