// app/auth/callback/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

function safeNext(input: unknown) {
  if (typeof input !== "string") return "/inbox";
  if (!input.startsWith("/")) return "/inbox";
  if (input.startsWith("//")) return "/inbox";
  if (input.includes("http://") || input.includes("https://")) return "/inbox";
  return input;
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const cookieStore = await cookies();

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

  // If this is a recovery link, ALWAYS go to /reset
  const nextPath = type === "recovery" ? "/reset" : safeNext(nextParam);

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
      redirect(
        `/login?next=${encodeURIComponent(nextPath)}&err=${encodeURIComponent(error.message)}`
      );
    }
  }

  redirect(nextPath);
}
