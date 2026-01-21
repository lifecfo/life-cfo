// app/(app)/revisit/page.tsx
"use client";

import RevisitClient from "./RevisitClient";

export const dynamic = "force-dynamic";

export default function RevisitPage() {
  return <RevisitClient />;
}
