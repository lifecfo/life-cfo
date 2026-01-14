"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "muted" | "success" | "warning" | "danger";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    default:
      "bg-zinc-900 text-white dark:bg-white dark:text-black",
    muted:
      "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
    success:
      "bg-emerald-600 text-white",
    warning:
      "bg-amber-500 text-black",
    danger:
      "bg-red-600 text-white",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
