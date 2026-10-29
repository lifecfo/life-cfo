// app/(app)/household/page.tsx
"use client";

import { Suspense } from "react";
import HouseholdClient from "./HouseholdClient";

export const dynamic = "force-dynamic";

export default function HouseholdPage() {
  return (
    <Suspense fallback={null}>
      <HouseholdClient />
    </Suspense>
  );
}