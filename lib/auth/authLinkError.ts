export function isPkceLinkError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return m.includes("pkce") || m.includes("code verifier");
}

export const PKCE_LINK_ERROR_MESSAGE =
  "This link is invalid or has expired. Please request a new one and open it in the same browser you requested it from.";

export function friendlyAuthLinkError(message: string): string {
  return isPkceLinkError(message) ? PKCE_LINK_ERROR_MESSAGE : message;
}

// A signup confirmation's email-verification step and its session handoff
// are two separate actions in GoTrue -- the account can already be
// confirmed even when either one fails, e.g. if something (an email
// client's link-prescanning, a double click) consumed the one-time token
// before the person's own click. That can surface as a PKCE/code-verifier
// error from exchangeCodeForSession, OR as GoTrue rejecting the token
// outright at /verify (error_code=otp_expired, "Email link is invalid or
// has expired") before a code is ever issued -- unlike a password reset
// link, a signup link failing this soon essentially never means a genuinely
// stale link, so every failure on this path gets the same friendly framing
// rather than only the ones matching the PKCE keyword check.
export const PKCE_SIGNUP_LINK_ERROR_MESSAGE =
  "This confirmation link didn't finish signing you in, but your email may already be confirmed. Try signing in with the password you set below. If that doesn't work, request a new confirmation email.";

export function friendlySignupLinkError(_message: string): string {
  return PKCE_SIGNUP_LINK_ERROR_MESSAGE;
}
