"use client";

import type { CSSProperties } from "react";

type CatSvgProps = {
  /** "full" draws the whole sitting cat; "peek-head" draws just the head/ears, for peeking above a box. */
  pose?: "full" | "peek-head";
  napping?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Minimal line-art cat, brand green, matching the stroke weight/style of
 * AppShell's nav icons (fill="none", round caps/joins). Idle motion (blink,
 * tail flick, ear twitch) is driven by the CSS classes defined in
 * mascotStyles.tsx -- this component only draws the shape.
 */
export function CatSvg({ pose = "full", napping = false, className, style }: CatSvgProps) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 50 50"
      className={className}
      style={{ color: "#1F5E5C", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <g className={napping ? "mascot-cat-breathe" : undefined}>
        {pose === "full" ? (
          <>
            <path className="mascot-cat-tail" style={{ transformOrigin: "14px 40px" }} d="M 14 40 C 6 38 4 26 12 18" {...stroke} />
            <path d="M 14 42 C 14 30 18 20 26 16" {...stroke} />
            <path d="M 30 19 C 27 24 25 32 25 40" {...stroke} />
            <path d="M 14 42 C 16 46 20 47 23 45" {...stroke} />
            <path d="M 23 40 L 23 45" {...stroke} />
            <path d="M 28 40 L 28 45" {...stroke} />
          </>
        ) : null}

        <circle cx="36" cy="14" r="7" {...stroke} />
        <path
          className="mascot-cat-ear-left"
          style={{ transformOrigin: "33px 8px" }}
          d="M 31 8 L 33 1 L 37 7 Z"
          {...stroke}
        />
        <path
          className="mascot-cat-ear-right"
          style={{ transformOrigin: "37px 7px" }}
          d="M 35 7 L 39 1 L 41 8 Z"
          {...stroke}
        />

        {napping ? (
          <>
            <path d="M 32 14 L 35 14" {...stroke} />
            <path d="M 36.5 13.5 L 39.5 13.5" {...stroke} />
          </>
        ) : (
          <>
            <ellipse className="mascot-cat-eye" style={{ transformOrigin: "33.5px 14px" }} cx="33.5" cy="14" rx="1.3" ry="1.6" fill="currentColor" stroke="none" />
            <ellipse className="mascot-cat-eye" style={{ transformOrigin: "38px 13.5px" }} cx="38" cy="13.5" rx="1.3" ry="1.6" fill="currentColor" stroke="none" />
          </>
        )}

        <circle cx="36" cy="18" r="0.7" fill="currentColor" stroke="none" />
        <path d="M 36 18 L 44 16" {...stroke} opacity="0.7" />
        <path d="M 36 18.5 L 45 18.5" {...stroke} opacity="0.7" />
        <path d="M 36 19 L 44 20" {...stroke} opacity="0.7" />
      </g>
    </svg>
  );
}
