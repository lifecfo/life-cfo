// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

/**
 * Server-only Supabase admin client (SERVICE ROLE).
 * Never import this into client components.
 */
export function supabaseAdmin() {
  const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Optional helper (used by some server routes/middleware patterns).
 * ✅ Removed /thinking from the protected set.
 */
export function isProtectedPathname(pathname: string) {
  const p = pathname || "/";

  return (
    // ✅ Life CFO Home
    p === "/lifecfo-home" ||
    p.startsWith("/lifecfo-home/") ||

    // ✅ Money hub + subroutes
    p === "/money" ||
    p.startsWith("/money/") ||

    // Existing Keystone routes
    p === "/home" ||
    p.startsWith("/home/") ||
    p === "/inbox" ||
    p.startsWith("/inbox/") ||
    p === "/capture" ||
    p.startsWith("/capture/") ||
    p === "/decisions" ||
    p.startsWith("/decisions/") ||
    p === "/revisit" ||
    p.startsWith("/revisit/") ||
    p === "/chapters" ||
    p.startsWith("/chapters/") ||
    p === "/accounts" ||
    p.startsWith("/accounts/") ||
    p === "/bills" ||
    p.startsWith("/bills/") ||
    p === "/income" ||
    p.startsWith("/income/") ||
    p === "/investments" ||
    p.startsWith("/investments/") ||
    p === "/budget" ||
    p.startsWith("/budget/") ||
    p === "/transactions" ||
    p.startsWith("/transactions/") ||
    p === "/settings" ||
    p.startsWith("/settings/") ||
    p === "/how-life-cfo-works" ||
    p.startsWith("/how-life-cfo-works/") ||
    p === "/fine-print" ||
    p.startsWith("/fine-print/")
  );
}
