"use client";

import type { CSSProperties } from "react";

type CheeseSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** Flat yellow cheese wedge with a couple of darker holes. */
export function CheeseSvg({ className, style }: CheeseSvgProps) {
  return (
    <svg viewBox="0 0 14 10" className={className} style={style} aria-hidden="true" focusable="false">
      <path d="M 1 9 L 7 1 L 13 9 Z" fill="#F6C945" stroke="#4B5563" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="6.5" r="1" fill="#E0AE2B" />
      <circle cx="9.5" cy="7.8" r="0.7" fill="#E0AE2B" />
    </svg>
  );
}
