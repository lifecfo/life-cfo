// components/Page.tsx
"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";

type PageProps = {
  title?: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  disableFeedback?: boolean;
};

export function Page({
  title,
  subtitle,
  right,
  children,
  className,
  disableFeedback = false,
}: PageProps) {
  return (
    <main className={cn("space-y-6", className)}>
      {(title || subtitle || right) ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title ? <h1 className="text-3xl font-semibold text-zinc-900">{title}</h1> : null}
            {subtitle ? <div className="text-sm text-zinc-600">{subtitle}</div> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      ) : null}

      <div className="space-y-6">
        {children}

        {!disableFeedback ? (
          <div className="border-t border-zinc-100 pt-6">
            <FeedbackPrompt pageTitle={typeof title === "string" ? title : undefined} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
