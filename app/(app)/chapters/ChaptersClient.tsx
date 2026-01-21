// app/(app)/chapters/ChaptersClient.tsx
"use client";

import { Page } from "@/components/Page";

export default function ChaptersClient() {
  return (
    <Page title="Chapters">
      <div className="mx-auto w-full max-w-[680px] space-y-10">
        {/* Ceremony-first frame */}
        <div className="space-y-3">
          <div className="text-[15px] leading-relaxed text-zinc-800">
            Chapters are honoured and closed.
          </div>
          <div className="text-sm leading-relaxed text-zinc-600">
            This is where completed seasons of life live — not as archives, but as stories with closure.
          </div>
        </div>

        {/* Empty state (v1-safe) */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">No chapters yet.</div>
            <div className="text-sm leading-relaxed text-zinc-600">
              When a season is complete, Keystone will help you honour it here.
            </div>

            <div className="pt-2 text-xs text-zinc-500">
              Chapters are intentionally not editable or actionable.
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
