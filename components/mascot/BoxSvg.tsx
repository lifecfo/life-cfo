"use client";

import type { CSSProperties } from "react";

type BoxSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** Flat cardboard box the cat peeks out from behind. */
export function BoxSvg({ className, style }: BoxSvgProps) {
  const outline = { stroke: "#4B5563", strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  return (
    <svg viewBox="0 0 32 24" className={className} style={style} aria-hidden="true" focusable="false">
      <path d="M 2 10 L 2 22 L 30 22 L 30 10 Z" fill="#C8A27A" {...outline} />
      <path d="M 2 10 L 16 4 L 30 10 L 16 15 Z" fill="#A9825A" {...outline} />
    </svg>
  );
}
