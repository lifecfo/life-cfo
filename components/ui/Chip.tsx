"use client";

import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BaseChipProps = {
  active?: boolean;
};

type ChipSpanProps = HTMLAttributes<HTMLSpanElement> & BaseChipProps & {
  onClick?: undefined;
  disabled?: undefined;
};

type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & BaseChipProps & {
  onClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>["onClick"]>;
};

export type ChipProps = ChipSpanProps | ChipButtonProps;

export function Chip({ className, active = false, ...props }: ChipProps) {
  const classes = cn(
    "inline-flex select-none items-center rounded-full border px-3 py-1 text-sm transition",
    active
      ? "border-zinc-900 bg-zinc-900 text-white"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20",
    className
  );

  // If it's clickable, render as a proper <button> for accessibility + keyboard support.
  if ("onClick" in props && typeof props.onClick === "function") {
    const { disabled, ...buttonProps } = props as ChipButtonProps;

    return (
      <button
        type="button"
        className={cn(
          classes,
          "cursor-pointer",
          disabled && "pointer-events-none opacity-50"
        )}
        disabled={disabled}
        {...buttonProps}
      />
    );
  }

  // Otherwise render as a visual-only chip
  return <span className={classes} {...(props as ChipSpanProps)} />;
}
