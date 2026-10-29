"use client";

import type { CSSProperties } from "react";

export type CatPose = "sitting" | "walking" | "peek-head";
export type CatExpression = "open" | "happy" | "sleepy" | "alert";

type CatSvgProps = {
  pose?: CatPose;
  expression?: CatExpression;
  /** Ears rotated up and alert -- used when the cat notices the mouse. */
  earsUp?: boolean;
  className?: string;
  style?: CSSProperties;
};

// Brand tokens, read from tailwind.config.js -- not guessed.
const TEAL = "#1F5E5C"; // cfo.DEFAULT / brand.teal -- main fur
const TEAL_DARK = "#174947"; // cfo.dark -- stripes, leg/tail shading, outline
const CREAM = "#F6F4F1"; // neutral.bg -- muzzle, chest, belly, paws, tail tip
const MUTED_PINK = "#B4707E"; // category.7 "Dusty rose" -- the closest on-brand pink; inner ears + nose
const CHARCOAL = "#2B2B2B"; // neutral.text -- eyes
const ACCENT = "#9B3C6E"; // brand.hibiscus -- collar, so it doesn't disappear into the teal fur

const outline = { stroke: TEAL_DARK, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Eye({ cx, cy, expression }: { cx: number; cy: number; expression: CatExpression }) {
  if (expression === "happy") {
    return <path d={`M ${cx - 4.5} ${cy + 1} Q ${cx} ${cy - 6} ${cx + 4.5} ${cy + 1}`} fill="none" stroke={CHARCOAL} strokeWidth="2.4" strokeLinecap="round" />;
  }
  if (expression === "sleepy") {
    return <path d={`M ${cx - 4.5} ${cy} Q ${cx} ${cy + 3} ${cx + 4.5} ${cy}`} fill="none" stroke={CHARCOAL} strokeWidth="2.2" strokeLinecap="round" />;
  }
  const pupilR = expression === "alert" ? 5 : 4;
  return (
    <g>
      <circle cx={cx} cy={cy} r={pupilR} fill={CHARCOAL} />
      <circle cx={cx - 1.4} cy={cy - 1.4} r="1.1" fill="#ffffff" />
      {/* The eyelid: hidden (scaleY 0) until the idle blink animation briefly closes it. */}
      <ellipse
        className="mascot-cat-eyelid"
        style={{ transformOrigin: `${cx}px ${cy - pupilR - 0.5}px` }}
        cx={cx}
        cy={cy}
        rx={pupilR + 0.8}
        ry={pupilR + 0.8}
        fill={TEAL}
      />
    </g>
  );
}

/**
 * Flat, filled cartoon cat mascot -- big round head, small body, short
 * legs, long curvy tail, in Life CFO's brand palette. Each anatomical
 * piece is its own SVG group so CSS keyframes (mascotStyles.tsx) can move
 * them independently: tail sway, ear twitch, blink, a walk cycle (legs
 * alternate + body bob), and a breathing scale while napping.
 */
export function CatSvg({ pose = "sitting", expression = "open", earsUp = false, className, style }: CatSvgProps) {
  const showBody = pose !== "peek-head";
  const walking = pose === "walking";

  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true" focusable="false">
      {showBody ? (
        <g className={walking ? "mascot-cat-walk-legs" : undefined}>
          <rect x="36" y="86" width="10" height="12" rx="5" fill={CREAM} {...outline} className="mascot-cat-leg-front" style={{ transformOrigin: "41px 86px" }} />
          <rect x="54" y="86" width="10" height="12" rx="5" fill={CREAM} {...outline} className="mascot-cat-leg-back" style={{ transformOrigin: "59px 86px" }} />
        </g>
      ) : null}

      {showBody ? (
        <g className={walking ? "mascot-cat-walk-body" : undefined}>
          <path
            className="mascot-cat-tail"
            style={{ transformOrigin: "70px 80px" }}
            d="M 70 80 C 92 78 96 52 82 34 C 94 46 94 76 72 86 Z"
            fill={TEAL}
            {...outline}
          />
          <ellipse cx="85" cy="40" rx="7" ry="6" fill={CREAM} />
          <path d="M 86 44 C 90 52 90 62 84 70" fill="none" stroke={TEAL_DARK} strokeWidth="3" strokeLinecap="round" />

          <g className="mascot-cat-breathe" style={{ transformOrigin: "50px 82px" }}>
            <ellipse cx="50" cy="84" rx="22" ry="17" fill={TEAL} {...outline} />
            <ellipse cx="50" cy="92" rx="15" ry="6" fill={TEAL_DARK} opacity="0.3" />
            <ellipse cx="50" cy="80" rx="11" ry="10" fill={CREAM} />
          </g>
        </g>
      ) : null}

      <g className={earsUp ? "mascot-cat-ears-up" : undefined}>
        <path className="mascot-cat-ear-left" style={{ transformOrigin: "40px 18px" }} d="M 30 20 L 36 2 L 48 17 Z" fill={TEAL} {...outline} />
        <path className="mascot-cat-ear-left" style={{ transformOrigin: "40px 18px" }} d="M 34 17 L 37 7 L 43 15 Z" fill={MUTED_PINK} />
        <path className="mascot-cat-ear-right" style={{ transformOrigin: "60px 18px" }} d="M 52 17 L 64 2 L 70 20 Z" fill={TEAL} {...outline} />
        <path className="mascot-cat-ear-right" style={{ transformOrigin: "60px 18px" }} d="M 57 15 L 63 7 L 66 17 Z" fill={MUTED_PINK} />
      </g>

      <circle cx="50" cy="38" r="23" fill={TEAL} {...outline} />
      <path d="M 42 16 C 44 22 44 26 42 30" fill="none" stroke={TEAL_DARK} strokeWidth="3" strokeLinecap="round" />
      <path d="M 50 14 C 52 20 52 25 50 29" fill="none" stroke={TEAL_DARK} strokeWidth="3" strokeLinecap="round" />
      <path d="M 58 16 C 60 22 60 26 58 30" fill="none" stroke={TEAL_DARK} strokeWidth="3" strokeLinecap="round" />

      <ellipse cx="50" cy="49" rx="15" ry="10" fill={CREAM} />

      <Eye cx={40} cy={36} expression={expression} />
      <Eye cx={60} cy={36} expression={expression} />

      <path d="M 50 44 L 47 48 L 53 48 Z" fill={MUTED_PINK} />
      <path d="M 36 46 L 24 44 M 36 48 L 23 48 M 36 50 L 24 52" stroke={TEAL_DARK} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M 64 46 L 76 44 M 64 48 L 77 48 M 64 50 L 76 52" stroke={TEAL_DARK} strokeWidth="1.1" strokeLinecap="round" />

      {expression === "sleepy" ? (
        <text x="68" y="18" fontSize="9" fill={TEAL_DARK} className="mascot-cat-zzz">
          z
        </text>
      ) : null}

      <path d="M 36 60 C 42 64 58 64 64 60 L 62 64 C 56 67 44 67 38 64 Z" fill={ACCENT} />
      <circle cx="50" cy="65" r="2.6" fill="#ffffff" stroke={ACCENT} strokeWidth="1" />
    </svg>
  );
}
