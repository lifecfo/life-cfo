import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import LoginClient from "./login/LoginClient";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some((cookie) => {
    const named =
      cookie.name === "sb-access-token" ||
      cookie.name === "sb-refresh-token" ||
      cookie.name.endsWith("-auth-token");
    return named && cookie.value.length > 20;
  });
  if (hasSession) redirect("/home");

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
      <LoginClient nextPath="/home" publicEntry />
    </Suspense>
  );
}
