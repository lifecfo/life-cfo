// components/FeedbackPrompt.tsx
"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

type Props = {
  className?: string;
  pageTitle?: string; // ✅ allow Page.tsx to pass this
};

const COPY_BY_PATH: Record<string, string> = {
  "/lifecfo-home": "Did this feel clear and grounded?",
  "/money": "Did this help you understand your household picture quickly?",
  "/decisions": "Did this help you make progress without overwhelm?",
  "/chapters": "Did this feel like a safe place to close things?",
};

export default function FeedbackPrompt({ className, pageTitle }: Props) {
  const pathname = usePathname();

  const prompt = useMemo(() => {
    // Prefer specific per-route copy
    if (pathname && COPY_BY_PATH[pathname]) return COPY_BY_PATH[pathname];

    // Fallback: if we have a page title, use it gently
    if (pageTitle) return `Was this page helpful?`;

    // Default fallback
    return "Was this helpful?";
  }, [pathname, pageTitle]);

  // If you have any feature-flag logic in your older file, keep it.
  // This is intentionally minimal so it won't break builds.

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="text-sm text-zinc-700">{prompt}</div>
      <div className="flex items-center gap-2">
        <Chip title="Send quick feedback">Yes</Chip>
        <Chip title="Send quick feedback">Not quite</Chip>
      </div>
    </div>
  );
}

