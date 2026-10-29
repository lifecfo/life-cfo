"use client";

import { useAsk } from "@/components/ask/AskProvider";
import { shouldHideAsk } from "@/lib/ask/publicPagesWithoutAsk";

export function AskLauncher() {
  const { openAsk, open, currentPath } = useAsk();

  if (open) return null;
  if (shouldHideAsk(currentPath)) return null;

  return (
    <button
      type="button"
      onClick={openAsk}
      aria-label="Open Ask Life CFO"
      className="fixed bottom-4 right-4 z-[70] rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 shadow-lg transition hover:bg-zinc-50"
    >
      Ask
    </button>
  );
}