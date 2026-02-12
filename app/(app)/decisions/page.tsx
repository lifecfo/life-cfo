"use client";

import { Suspense } from "react";
import ThinkingClient from "@/app/(app)/thinking/ThinkingClient";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  const stamp = process.env.NEXT_PUBLIC_BUILD_STAMP || "dev";

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[760px] p-6 text-sm text-zinc-600">
          Loading… <span className="ml-2 text-xs text-zinc-400">({stamp})</span>
        </div>
      }
    >
      {/* tiny marker to prove deploy is serving this route */}
      <div className="mx-auto w-full max-w-[760px] px-6 pt-2 text-right text-[11px] text-zinc-400">
        Decisions → ThinkingClient • {stamp}
      </div>

      <ThinkingClient surface="decisions" />
    </Suspense>
  );
}
