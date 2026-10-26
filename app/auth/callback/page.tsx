// app/auth/callback/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { friendlyAuthLinkError } from "@/lib/auth/authLinkError";

function safeNext(input: unknown) {
  if (typeof input !== "string") return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  if (input.includes("http://") || input.includes("https://")) return null;
  return input;
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // ✅ Fix TS in Next where cookies() is typed async in some versions
  type CookieStore = Awaited<ReturnType<typeof cookies>>;
  const cookieStore: CookieStore = await cookies();

  const code =
    typeof searchParams.code === "string"
      ? searchParams.code
      : Array.isArray(searchParams.code)
      ? searchParams.code[0]
      : undefined;

  const type =
    typeof searchParams.type === "string"
      ? searchParams.type
      : Array.isArray(searchParams.type)
      ? searchParams.type[0]
      : undefined;

  const nextParam =
    typeof searchParams.next === "string"
      ? searchParams.next
      : Array.isArray(searchParams.next)
      ? searchParams.next[0]
      : undefined;

  // ✅ Default: after a normal signup/login confirmation, go to Fine print.
  // Fine print will send them onward using its `next` param after signing.
  const defaultNext = "/fine-print?next=%2Fhome";

  // If this is a recovery link, ALWAYS go to /reset
  const safe = safeNext(nextParam);
  const nextPath = type === "recovery" ? "/reset" : safe ?? defaultNext;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const friendly = friendlyAuthLinkError(error.message);
      if (type === "recovery") {
        redirect(`/reset?err=${encodeURIComponent(friendly)}`);
      }
      redirect(`/login?next=${encodeURIComponent(nextPath)}&err=${encodeURIComponent(friendly)}`);
    }
  }

  redirect(nextPath);
}
