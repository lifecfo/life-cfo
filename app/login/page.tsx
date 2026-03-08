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
            background: "#1F5E5C",
            color: "#FFFFFF",
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