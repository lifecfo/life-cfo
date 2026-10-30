"use client";

/**
 * Hand-drawn speech bubble. Both tails are drawn; the parent
 * `[data-side]` shows the one that points at the cat. The shape is an
 * absolute background, so swapping tails does not change layout.
 */
export function BubbleShape() {
  return (
    <svg
      viewBox="0 0 220 80"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
    >
      <path
        d="M 14 17 C 8 10 20 3 35 4 C 71 0 148 2 190 8 C 208 10 212 20 209 31 C 213 46 206 62 193 68 C 158 74 87 73 48 70 C 26 69 10 64 8 50 C 4 36 8 25 14 17 Z"
        fill="#F6F4F1"
        stroke="#1F5E5C"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Bubble on the cat's left: tail on the right edge, pointing at the cat. */}
      <path className="mascot-bubble-tail" data-tail="left" d="M 203 32 L 220 40 L 201 50 Z" fill="#F6F4F1" stroke="#1F5E5C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Bubble on the cat's right: tail on the left edge. */}
      <path className="mascot-bubble-tail" data-tail="right" d="M 17 32 L 0 40 L 19 50 Z" fill="#F6F4F1" stroke="#1F5E5C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
