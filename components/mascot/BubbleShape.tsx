"use client";

type BubbleShapeProps = {
  /** Which side of the bubble the cat is on -- the tail points that way. */
  tailSide: "left" | "right";
};

/**
 * The hand-drawn speech bubble outline -- a wobbly, irregular blob (not a
 * rounded rectangle) with a small tail pointing sideways at the cat's
 * head, cream fill and a marker-pen-style teal stroke. Rendered as an
 * absolute-positioned background that stretches (preserveAspectRatio=
 * "none") to fit whatever size the text content gives the bubble.
 */
export function BubbleShape({ tailSide }: BubbleShapeProps) {
  // Tail protrudes from the edge nearest the cat and points toward it:
  // bubble-on-the-cat's-left means the cat is to the bubble's right, so
  // the tail comes off the right edge pointing right (and vice versa).
  const tail =
    tailSide === "left"
      ? "M 203 32 L 220 40 L 201 50 Z"
      : "M 17 32 L 0 40 L 19 50 Z";

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
      <path d={tail} fill="#F6F4F1" stroke="#1F5E5C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
