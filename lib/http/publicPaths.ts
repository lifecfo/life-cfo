/**
 * Paths a signed-out visitor can open. The site root is the public landing;
 * /account-deleted is where the delete-account flow signs someone out to.
 */
export function isLoggedOutEntryPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/account-deleted";
}
