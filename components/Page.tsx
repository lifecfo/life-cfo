// components/Page.tsx
"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";
import FeedbackPrompt from "@/components/FeedbackPrompt";

type PageProps = {
  title?: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  disableFeedback?: boolean;
};

export function Page({ title, subtitle, right, children, className, disableFeedback = false }: PageProps) {
  return (
    <main className={cn("space-y-6 md:space-y-5 lg:space-y-4", className)}>
      {title || subtitle || right ? (
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            {title ? <h1 className="text-3xl font-semibold text-zinc-900">{title}</h1> : null}

            {subtitle ? (
              <div className="text-sm text-zinc-600 max-w-[68ch]">
                {subtitle}
              </div>
            ) : null}
          </div>

          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      ) : null}

      <div className="space-y-6 md:space-y-5 lg:space-y-4">
        {children}

        {!disableFeedback ? (
          <div className="border-t border-zinc-100 pt-5 md:pt-4 lg:pt-4">
            <FeedbackPrompt pageTitle={typeof title === "string" ? title : undefined} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
