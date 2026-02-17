// lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function getSupabaseKey() {
  // Support either env var name
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getSupabaseKey();
  if (!anonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // write cookies to BOTH the request (for downstream) and response (for browser)
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: getClaims verifies JWT properly
  const { data } = await supabase.auth.getClaims();
  const userClaims = data?.claims;

  const { pathname, search } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  // Keep your existing protected list logic (so we don't accidentally change auth behavior)
  const isProtected =
    // ✅ Life CFO Home
    pathname === "/lifecfo-home" ||
    pathname.startsWith("/lifecfo-home/") ||

    // ✅ Money hub + subroutes
    pathname === "/money" ||
    pathname.startsWith("/money/") ||

    // Existing Keystone routes
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/") ||
    pathname === "/capture" ||
    pathname.startsWith("/capture/") ||
    pathname === "/decisions" ||
    pathname.startsWith("/decisions/") ||
    pathname === "/revisit" ||
    pathname.startsWith("/revisit/") ||
    pathname === "/chapters" ||
    pathname.startsWith("/chapters/") ||
    pathname === "/accounts" ||
    pathname.startsWith("/accounts/") ||
    pathname === "/bills" ||
    pathname.startsWith("/bills/") ||
    pathname === "/income" ||
    pathname.startsWith("/income/") ||
    pathname === "/investments" ||
    pathname.startsWith("/investments/") ||
    pathname === "/budget" ||
    pathname.startsWith("/budget/") ||
    pathname === "/transactions" ||
    pathname.startsWith("/transactions/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/how-life-cfo-works" ||
    pathname.startsWith("/how-life-cfo-works/") ||
    pathname === "/fine-print" ||
    pathname.startsWith("/fine-print/");

  // If not signed in and trying to access protected pages → redirect to login with next
  if (!userClaims && isProtected && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // If signed in and trying to access /login → send them to next (or home)
  if (userClaims && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const next = url.searchParams.get("next");
    url.pathname = next || "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ---------- Fine print gate ----------
  // Only applies to signed-in users, and only for non-public pages
  if (userClaims && !isPublic) {
    const allowWithoutConsent = new Set([
      "/fine-print",
      "/how-life-cfo-works",
      "/settings",
      "/settings/delete",
    ]);

    if (!allowWithoutConsent.has(pathname)) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("fine_print_accepted_at,fine_print_version")
        .eq("user_id", userClaims.sub) // JWT subject = auth user id
        .maybeSingle();

      const accepted = !!prof?.fine_print_accepted_at;

      // If profile row doesn't exist yet, treat as not accepted (redirect to fine print)
      if (!accepted && !profErr) {
        const url = request.nextUrl.clone();
        url.pathname = "/fine-print";
        url.searchParams.set("next", pathname + search);
        return NextResponse.redirect(url);
      }

      // If there was a DB error, don't hard-block the user (avoid lockout loops)
      // Just let them through; you'll see the error in logs.
    }
  }

  return response;
}
