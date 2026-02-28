// app/(app)/budget/page.tsx
"use client";

import { Suspense } from "react";
import BudgetClient from "./BudgetClient";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-[760px] p-6 text-sm text-zinc-600">Loading…</div>}>
      <BudgetClient />
    </Suspense>
  );
}