"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  /** Calm authority — main actions */
  primary:
    "bg-btn-primary text-btn-primaryText " +
    "hover:bg-btn-primaryHover focus:ring-brand-teal/30",

  /** Gentle, default action */
  secondary:
    "bg-btn-secondary text-btn-secondaryText border border-neutral-border " +
    "hover:bg-btn-secondaryHover focus:ring-brand-aqua/30",

  /** Minimal affordance */
  ghost:
    "bg-transparent text-brand-teal " +
    "hover:bg-btn-ghostHover focus:ring-brand-aqua/30",

  /** Destructive (system state, not emotional) */
  danger:
    "bg-semantic-error text-white " +
    "hover:bg-semantic-error/90 focus:ring-semantic-error/30",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
