"use client";

import type { CSSProperties } from "react";

type MouseSvgProps = {
  className?: string;
  style?: CSSProperties;
};

const BODY = "#B8A99A";
const PINK = "#F4A6B5";
const INK = "#1F2937";
const OUTLINE = "#4B5563";

/** Flat, filled cartoon mouse -- same palette family and outline weight as the cat. */
export function MouseSvg({ className, style }: MouseSvgProps) {
  const outline = { stroke: OUTLINE, strokeWidth: 1.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  return (
    <svg viewBox="0 0 60 40" className={className} style={style} aria-hidden="true" focusable="false">
      <path className="mascot-mouse-tail" style={{ transformOrigin: "16px 28px" }} d="M 16 28 C 4 30 2 18 10 13" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="28" cy="26" rx="16" ry="11" fill={BODY} {...outline} />
      <circle cx="46" cy="19" r="9" fill={BODY} {...outline} />
      <circle cx="41" cy="9" r="6" fill={PINK} {...outline} />
      <circle cx="50" cy="8" r="6.5" fill={PINK} {...outline} />
      <circle cx="49" cy="17" r="1.8" fill={INK} />
      <circle cx="48.3" cy="16.3" r="0.6" fill="#ffffff" />
      <circle cx="54" cy="20" r="1.6" fill={PINK} />
      <path d="M 22 35 L 22 38 M 30 35.5 L 30 38" stroke={OUTLINE} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
