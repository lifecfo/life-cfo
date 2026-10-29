"use client";

import type { CSSProperties } from "react";

export type CatPose = "sitting" | "loaf" | "crouch" | "pounce";
export type CatExpression = "content" | "alert" | "sleepy" | "happy";

type CatSvgProps = {
  pose?: CatPose;
  expression?: CatExpression;
  /** Brief bum-wiggle, used right before a pounce. */
  wiggle?: boolean;
  className?: string;
  style?: CSSProperties;
};

const TEAL = "#1F5E5C"; // cfo.DEFAULT / brand.teal
const ACCENT = "#9B3C6E"; // brand.hibiscus -- a subtle collar line

const POSE_TRANSFORM: Record<CatPose, string> = {
  sitting: "none",
  loaf: "scaleY(0.75) translateY(18px)",
  crouch: "scaleY(0.85) translateY(10px) translateX(-4px)",
  pounce: "translateX(26px) translateY(-16px) scaleY(0.95)",
};

function EyeShape({ expression }: { expression: CatExpression }) {
  // Eye centred around (58, 23). A soft upward curve reads as content;
  // a bigger, rounder upward arc reads as happy; a downward arc as
  // sleepy; a small dot as alert. The idle blink (mascotStyles.tsx)
  // crossfades the "content" curve with a flat closed line, so it only
  // applies to that expression.
  if (expression === "happy") {
    return <path d="M 52 25 Q 58 15 64 25" fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" />;
  }
  if (expression === "sleepy") {
    return (
      <>
        <path d="M 53 22 Q 58 27 63 22" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
        <text x="66" y="12" fontSize="8" fill={TEAL} className="mascot-cat-zzz">
          z
        </text>
      </>
    );
  }
  if (expression === "alert") {
    return <circle cx="58" cy="23" r="2.1" fill={TEAL} />;
  }
  return (
    <>
      <path className="mascot-cat-eye-open" d="M 53 24 Q 58 20 63 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
      <path className="mascot-cat-eye-closed" d="M 53 23 L 63 23" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" opacity="0" />
    </>
  );
}

/**
 * An original minimalist single-line cat, sitting upright in profile --
 * brand teal, no fill, variable stroke weight (thicker along the back
 * and tail, thinner at the ears/chest/paws). Each anatomical piece is
 * its own SVG group so CSS (mascotStyles.tsx) can move it independently:
 * tail-tip flick, ear flick, blink, whisker twitch, a head tilt, and
 * pose changes (sitting/loaf/crouch/pounce) via transform + a soft
 * opacity dip rather than redrawn geometry.
 */
export function CatSvg({ pose = "sitting", expression = "content", wiggle = false, className, style }: CatSvgProps) {
  const round = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" as const };

  return (
    <svg viewBox="0 0 110 132" className={className} style={style} aria-hidden="true" focusable="false">
      <g
        className="mascot-cat-pose"
        style={{ transform: POSE_TRANSFORM[pose], transformOrigin: "60px 128px" }}
      >
        <g className="mascot-cat-body">
          {/* chest + front leg -- thin */}
          <path d="M 46 124 C 42 108 40 85 46 55 C 48 48 50 42 52 38" stroke={TEAL} strokeWidth="1.8" {...round} />
          {/* back of head to long back arch -- thick */}
          <path d="M 68 14 C 78 16 88 28 88 46 C 90 58 88 72 84 86" stroke={TEAL} strokeWidth="4" {...round} />
          {/* haunch to rear leg -- thin, with a brief wiggle right before a pounce */}
          <path
            className={wiggle ? "mascot-cat-wiggle" : undefined}
            style={{ transformOrigin: "80px 96px" }}
            d="M 84 86 C 80 98 74 112 66 124"
            stroke={TEAL}
            strokeWidth="1.8"
            {...round}
          />
        </g>

        <g className="mascot-cat-tail" style={{ transformOrigin: "84px 86px" }}>
          <path d="M 84 86 C 92 82 98 72 98 58" stroke={TEAL} strokeWidth="3" {...round} />
          <g className="mascot-cat-tail-tip" style={{ transformOrigin: "98px 58px" }}>
            <path d="M 98 58 C 98 44 92 34 82 32 C 70 34 60 46 60 64" stroke={TEAL} strokeWidth="1.6" {...round} />
          </g>
        </g>

        <g className="mascot-cat-head" style={{ transformOrigin: "60px 28px" }}>
          {/* chin to nape -- medium, bridges the body's two segments */}
          <path d="M 52 38 C 54 30 56 22 58 14 C 60 12 64 12 68 14" stroke={TEAL} strokeWidth="2.2" {...round} />

          <g className="mascot-cat-ear-left" style={{ transformOrigin: "55px 13px" }}>
            <path d="M 50 13 L 54 2 L 60 12" stroke={TEAL} strokeWidth="1.5" {...round} />
          </g>
          <g className="mascot-cat-ear-right" style={{ transformOrigin: "62px 12px" }}>
            <path d="M 57 12 L 63 1 L 67 13" stroke={TEAL} strokeWidth="1.5" {...round} />
          </g>

          <g className="mascot-cat-eye">
            <EyeShape expression={expression} />
          </g>

          <g className="mascot-cat-whiskers">
            <path d="M 56 28 L 68 24 M 56 31 L 69 30 M 56 34 L 67 36" stroke={TEAL} strokeWidth="1" strokeLinecap="round" />
          </g>

          <path d="M 54 33 L 57 36" stroke={TEAL} strokeWidth="1.2" strokeLinecap="round" />

          {/* a subtle collar accent, so it's unmistakably Life CFO's cat */}
          <path d="M 44 48 C 48 52 56 52 60 47" stroke={ACCENT} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
