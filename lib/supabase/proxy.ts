import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseKey() {
  // Support either env var name (you may have ANON_KEY already)
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // write cookies to BOTH the request (for downstream) and response (for browser)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: use getClaims() for protection (verifies JWT properly)
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname, search } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const isProtected =
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/") ||
    pathname === "/decisions" ||
    pathname.startsWith("/decisions/") ||
    pathname === "/accounts" ||
    pathname.startsWith("/accounts/") ||
    pathname === "/bills" ||
    pathname.startsWith("/bills/") ||
    pathname === "/income" ||
    pathname.startsWith("/income/") ||
    pathname === "/engine" ||
    pathname.startsWith("/engine/");

  // If not signed in and trying to access protected pages → redirect to login with next
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // If signed in and trying to access /login → send them to next (or inbox)
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const next = url.searchParams.get("next");
    url.pathname = next || "/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
