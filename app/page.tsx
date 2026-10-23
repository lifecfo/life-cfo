import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/Landing";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some((cookie) => {
    return cookie.name === "sb-access-token" || cookie.name === "sb-refresh-token" || cookie.name.endsWith("-auth-token");
  });
  if (hasSession) redirect("/home");
  return <Landing />;
}
