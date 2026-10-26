// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { friendlyAuthLinkError, friendlySignupLinkError } from "@/lib/auth/authLinkError";

function safeNext(input: string | null) {
  if (!input) return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  if (input.includes("http://") || input.includes("https://")) return null;
  return input;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const nextParam = url.searchParams.get("next");

  // GoTrue itself redirects straight here with ?error=... (no code at all)
  // when the token fails at verification -- expired, already used, or
  // tampered. That's distinct from exchangeCodeForSession failing below
  // (a code was issued but the exchange itself errors), and was previously
  // not checked at all, so an expired confirmation link looked successful.
  const verifyError = url.searchParams.get("error_description") || url.searchParams.get("error");

  // Default: after a normal signup/login confirmation, go to Fine print.
  // Fine print will send them onward using its `next` param after signing.
  const defaultNext = "/fine-print?next=%2Fhome";

  // If this is a recovery link, ALWAYS go to /reset
  const safe = safeNext(nextParam);
  const nextPath = type === "recovery" ? "/reset" : safe ?? defaultNext;

  if (verifyError && !code) {
    const destination =
      type === "recovery"
        ? new URL(`/reset?err=${encodeURIComponent(friendlyAuthLinkError(verifyError))}`, url.origin)
        : new URL(
            `/login?next=${encodeURIComponent(nextPath)}&err=${encodeURIComponent(friendlySignupLinkError(verifyError))}`,
            url.origin
          );
    return NextResponse.redirect(destination);
  }

  let response = NextResponse.redirect(new URL(nextPath, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.headers.get("cookie")?.match(new RegExp(`${name}=([^;]+)`))?.[1];
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const destination =
        type === "recovery"
          ? new URL(`/reset?err=${encodeURIComponent(friendlyAuthLinkError(error.message))}`, url.origin)
          : new URL(
              `/login?next=${encodeURIComponent(nextPath)}&err=${encodeURIComponent(friendlySignupLinkError(error.message))}`,
              url.origin
            );
      response = NextResponse.redirect(destination);
    }
  }

  return response;
}
