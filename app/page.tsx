// app/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RootPage() {
  // Always send users to the real entry point.
  // The `next` param ensures post-login goes to /home.
  redirect("/login?next=%2Fhome");
}