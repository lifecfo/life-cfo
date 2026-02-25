// lib/supabaseRoute.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client for Next.js Route Handlers.
 * Uses cookie-based auth (no bearer tokens from the client).
 *
 * Note: Route Handlers can’t always persist auth cookie updates reliably
 * without attaching them to a Response. For our read-mostly APIs, this is fine.
 */
export async function supabaseRoute() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Best-effort only. Safe no-op if Next prevents mutation in this context.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    }
  );
}