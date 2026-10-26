import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { safeNextPath } from "@/lib/http/safeNextPath";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = await Promise.resolve(searchParams);
  const nextParam = params?.next;
  const next = safeNextPath(
    typeof nextParam === "string" ? nextParam : Array.isArray(nextParam) ? nextParam[0] : "/home"
  );

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