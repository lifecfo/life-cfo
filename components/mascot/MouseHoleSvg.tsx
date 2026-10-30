"use client";

import type { CSSProperties } from "react";

type MouseHoleSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** Flat, filled mouse hole -- a dark arch with a slightly lighter rim. */
export function MouseHoleSvg({ className, style }: MouseHoleSvgProps) {
  return (
    <svg viewBox="0 0 28 20" className={className} style={style} aria-hidden="true" focusable="false">
      <path d="M 2 20 L 2 11 C 2 5 7 1 14 1 C 21 1 26 5 26 11 L 26 20 Z" fill="#3F3A36" />
      <path
        d="M 2 20 L 2 11 C 2 5 7 1 14 1 C 21 1 26 5 26 11 L 26 20"
        fill="none"
        stroke="#5C564F"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
