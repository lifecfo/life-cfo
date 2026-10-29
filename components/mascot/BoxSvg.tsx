"use client";

import type { CSSProperties } from "react";

type BoxSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** A small open box the cat peeks out from behind, same brand line-art style. */
export function BoxSvg({ className, style }: BoxSvgProps) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 32 24" className={className} style={{ color: "#1F5E5C", ...style }} aria-hidden="true" focusable="false">
      <path d="M 2 10 L 16 4 L 30 10 L 16 16 Z" {...stroke} />
      <path d="M 2 10 L 2 20 L 16 24 L 16 16" {...stroke} />
      <path d="M 30 10 L 30 20 L 16 24" {...stroke} />
    </svg>
  );
}
