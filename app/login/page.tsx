// app/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const nextParam = searchParams?.next;
  const next =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
      ? nextParam[0]
      : "/inbox";

  // Wrap the client component in Suspense to keep Next happy during prerender
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>}>
      <LoginClient nextPath={next} />
    </Suspense>
  );
}
