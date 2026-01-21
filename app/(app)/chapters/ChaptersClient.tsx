// app/(app)/chapters/ChaptersClient.tsx
"use client";

import { Page } from "@/components/Page";

export default function ChaptersClient() {
  return (
    <Page title="Chapters">
      <div className="mx-auto w-full max-w-[680px] space-y-6">
        <div className="text-[15px] leading-relaxed text-zinc-800">
          Chapters are honoured and closed.
        </div>

        <div className="text-sm text-zinc-600">
          This page is intentionally quiet in v1. We’ll add the ceremony-first Chapter components next.
        </div>
      </div>
    </Page>
  );
}
