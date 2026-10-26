// app/auth/reset/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { friendlyAuthLinkError } from "@/lib/auth/authLinkError";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Where we want to land after completing the exchange
  const redirectTo = new URL("/reset", url.origin);

  // We need a response we can attach cookies to
  let response = NextResponse.redirect(redirectTo);

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
      // Send them to the reset page itself so it can explain what went
      // wrong, instead of dumping a raw auth error on the login screen.
      const errorUrl = new URL("/reset", url.origin);
      errorUrl.searchParams.set("err", friendlyAuthLinkError(error.message));
      response = NextResponse.redirect(errorUrl);
    }
  } else {
    // No code — go to reset page which will tell them to request a new email
    response = NextResponse.redirect(redirectTo);
  }

  return response;
}
