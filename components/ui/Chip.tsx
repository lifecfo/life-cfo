"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  active?: boolean;
};

export function Chip({ className, active = false, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-full border px-3 py-1 text-sm transition",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
        className
      )}
      {...props}
    />
  );
}
