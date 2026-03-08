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
      : "/home";

  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "system-ui",
            background: "#F6F4F1",
            color: "#2B2B2B",
          }}
        >
          Loading…
        </div>
      }
    >
      <LoginClient nextPath={next} />
    </Suspense>
  );
}