// lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  BANK_TOOL_PREFIXES,
  DEVELOPER_ONLY_PREFIXES,
  INVITE_EXEMPT_PREFIXES,
  isProtectedAppPath,
  matchesPathPrefix,
} from "@/lib/http/appPaths";
import { safeNextPath } from "@/lib/http/safeNextPath";
import { legalPackSha256 } from "@/lib/legal/legalPackHash";
import { betaAccessForUser } from "@/lib/server/access/betaAccess";

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function getSupabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
}

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  const safe = safeNextPath(pathname, "/home");
  const parsed = new URL(safe, "https://life-cfo.local");
  url.pathname = parsed.pathname;
  url.search = parsed.search;
  if (next) url.searchParams.set("next", safeNextPath(next, "/home"));
  return NextResponse.redirect(url);
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
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userClaims = data?.claims as { sub?: string; email?: string; app_metadata?: unknown } | undefined;

  const { pathname, search } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/how-life-cfo-works" ||
    pathname.startsWith("/how-life-cfo-works/");

  const isProtected = isProtectedAppPath(pathname);

  if (!userClaims?.sub && isProtected && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeNextPath(pathname + search, "/home"));
    return NextResponse.redirect(url);
  }

  if (userClaims?.sub && pathname.startsWith("/login")) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/home");
    return redirectTo(request, next);
  }

  if (!userClaims?.sub) return response;

  const user = {
    email: typeof userClaims.email === "string" ? userClaims.email : null,
    app_metadata: userClaims.app_metadata,
  };
  const { data: accessRow } = await supabase
    .from("beta_access")
    .select("user_id")
    .eq("user_id", userClaims.sub)
    .maybeSingle();
  const access = betaAccessForUser(user, { hasAccessRow: Boolean(accessRow?.user_id) });

  if (!access.isDeveloper && matchesPathPrefix(pathname, DEVELOPER_ONLY_PREFIXES)) {
    return redirectTo(request, "/lifecfo-home");
  }

  if (!access.canUseRealDataSources && matchesPathPrefix(pathname, BANK_TOOL_PREFIXES)) {
    return redirectTo(request, "/money/setup");
  }

  if (
    !access.isInvited &&
    isProtected &&
    !isPublic &&
    !matchesPathPrefix(pathname, INVITE_EXEMPT_PREFIXES)
  ) {
    return redirectTo(request, "/beta-invite", pathname + search);
  }

  if (userClaims && !isPublic && access.isInvited) {
    const allowWithoutConsent = new Set([
      "/fine-print",
      "/welcome",
      "/how-life-cfo-works",
      "/settings",
      "/settings/delete",
      "/beta-invite",
      "/privacy",
      "/terms",
    ]);

    if (!allowWithoutConsent.has(pathname)) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("fine_print_accepted_at,fine_print_version,confirmed_adult,confirmed_au_resident")
        .eq("user_id", userClaims.sub)
        .maybeSingle();

      const accepted =
        !!prof?.fine_print_accepted_at &&
        prof?.fine_print_version === legalPackSha256() &&
        prof?.confirmed_adult === true &&
        prof?.confirmed_au_resident === true;

      if (profErr || !accepted) {
        return redirectTo(request, "/welcome", pathname + search);
      }
    }
  }

  return response;
}
