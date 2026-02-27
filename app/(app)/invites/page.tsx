// app/(app)/invites/page.tsx
"use client";

import InvitesClient from "./InvitesClient";

export const dynamic = "force-dynamic";

export default function InvitesPage() {
  return <InvitesClient />;
}