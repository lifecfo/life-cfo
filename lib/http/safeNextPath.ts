const FALLBACK = "/home";

/**
 * Keep post-login redirects on this site.
 * Accepts only a single path, optionally with a query string.
 */
export function safeNextPath(input: unknown, fallback = FALLBACK): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\") || trimmed.includes("://")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;

  let url: URL;
  try {
    url = new URL(trimmed, "https://life-cfo.local");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://life-cfo.local") return fallback;
  if (url.username || url.password) return fallback;
  return `${url.pathname}${url.search}`;
}
