import type * as React from "react";
import { cn } from "@/lib/cn";

type PageProps = {
  title?: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Page({ title, subtitle, right, children, className }: PageProps) {
  return (
    <main className={cn("mx-auto w-full max-w-[900px] px-6 py-6 font-sans", className)}>
      {(title || subtitle || right) && (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title && <h1 className="m-0 text-2xl font-semibold">{title}</h1>}
            {subtitle && <div className="text-sm text-zinc-600">{subtitle}</div>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}

      <div className="space-y-6">{children}</div>
    </main>
  );
}
