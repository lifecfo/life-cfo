// The real production hostnames the mascot's dev-only ?mascotScene= query
// param must never work on, even if NODE_ENV happens to read "production"
// (a local `next build && next start`, or a misconfigured deploy).
const PRODUCTION_HOSTNAMES = new Set(["www.life-cfo.com", "life-cfo.com"]);

/**
 * True for local dev and any non-production host (Vercel preview
 * deployments included). False on the real production domain, where the
 * dev-only scene trigger must be a no-op regardless of query string.
 */
export function isDevOrPreviewEnvironment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  return !PRODUCTION_HOSTNAMES.has(window.location.hostname);
}
