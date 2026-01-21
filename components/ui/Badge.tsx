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
    /** Neutral label — informational */
    default:
      "bg-neutral-surface text-neutral-text border border-neutral-border",

    /** De-emphasised / background info */
    muted:
      "bg-neutral-bg text-neutral-text-2 border border-neutral-border",

    /** Positive system state */
    success:
      "bg-alert-successBg text-alert-successText border border-semantic-success",

    /** Gentle heads-up */
    warning:
      "bg-alert-warningBg text-alert-warningText border border-semantic-warning",

    /** Destructive / error state */
    danger:
      "bg-alert-errorBg text-alert-errorText border border-semantic-error",
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
