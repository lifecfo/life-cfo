"use client";

import type { CSSProperties } from "react";

type MouseSvgProps = {
  className?: string;
  style?: CSSProperties;
};

/** Tiny line-art mouse, same brand green and stroke style as the cat. */
export function MouseSvg({ className, style }: MouseSvgProps) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="-6 0 30 16" className={className} style={{ color: "#1F5E5C", ...style }} aria-hidden="true" focusable="false">
      <path className="mascot-mouse-tail" style={{ transformOrigin: "6px 11px" }} d="M 6 11 C -2 11 -4 4 2 2" {...stroke} />
      <ellipse cx="12" cy="10" rx="6" ry="4" {...stroke} />
      <circle cx="19" cy="8" r="3" {...stroke} />
      <circle cx="17" cy="4" r="1.5" {...stroke} />
      <circle cx="20.5" cy="4.5" r="1.5" {...stroke} />
      <circle cx="20" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="22.3" cy="8" r="0.5" fill="currentColor" stroke="none" />
      <path d="M 9 13.5 L 9 15" {...stroke} />
      <path d="M 14 13.8 L 14 15" {...stroke} />
    </svg>
  );
}
