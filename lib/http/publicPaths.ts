/** Paths a signed-out visitor can open. The site root is the public landing. */
export function isLoggedOutEntryPath(pathname: string): boolean {
  return pathname === "/";
}
