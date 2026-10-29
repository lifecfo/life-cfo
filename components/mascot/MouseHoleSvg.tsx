"use client";

import type { CSSProperties } from "react";

type MouseHoleSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** A simple arch -- the mouse hole, same brand green line-art style. */
export function MouseHoleSvg({ className, style }: MouseHoleSvgProps) {
  return (
    <svg viewBox="0 0 28 20" className={className} style={{ color: "#1F5E5C", ...style }} aria-hidden="true" focusable="false">
      <path
        d="M 2 20 L 2 11 C 2 5 7 1 14 1 C 21 1 26 5 26 11 L 26 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
