// components/FeedbackPrompt.tsx
"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Chip } from "@/components/ui";

const COPY: Record<string, string> = {
  "/capture": "Was it easy to put this down here?",
  "/decisions": "Did this help you think without overwhelm?",
  "/revisit": "Did Review show the right amount—no more, no less?",
  "/chapters": "Did it feel good to close something with clarity?",
  "/lifecfo-home": "Did this feel calm and grounding?",
};

function normalizePath(pathname: string) {
  // keep it simple: treat /decisions/* as /decisions, etc.
  const p = pathname || "/";
  if (p === "/") return p;

  const roots = ["/capture", "/decisions", "/revisit", "/chapters", "/lifecfo-home"];
  for (const r of roots) {
    if (p === r || p.startsWith(r + "/")) return r;
  }
  return p;
}

export function FeedbackPrompt({ className }: { className?: string }) {
  const pathname = usePathname() || "/";
  const [dismissed, setDismissed] = useState(false);

  const key = useMemo(() => normalizePath(pathname), [pathname]);
  const text = COPY[key];

  if (dismissed) return null;
  if (!text) return null;

  return (
    <div className={className}>
      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <div className="text-sm text-zinc-700">{text}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip onClick={() => setDismissed(true)} title="Dismiss">
            Thanks
          </Chip>
        </div>
      </div>
    </div>
  );
}
