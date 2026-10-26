export function isPkceLinkError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return m.includes("pkce") || m.includes("code verifier");
}

export const PKCE_LINK_ERROR_MESSAGE =
  "This link is invalid or has expired. Please request a new one and open it in the same browser you requested it from.";

export function friendlyAuthLinkError(message: string): string {
  return isPkceLinkError(message) ? PKCE_LINK_ERROR_MESSAGE : message;
}
