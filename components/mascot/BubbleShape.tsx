"use client";

type BubbleShapeProps = {
  tailSide?: "left" | "right";
};

/**
 * The hand-drawn speech bubble outline -- a wobbly, irregular blob (not a
 * rounded rectangle) with a small tail, cream fill and a marker-pen-style
 * teal stroke. Rendered as an absolute-positioned background that
 * stretches (preserveAspectRatio="none") to fit whatever size the text
 * content gives the bubble, so the wobble scales with the line length.
 */
export function BubbleShape({ tailSide = "left" }: BubbleShapeProps) {
  const tail =
    tailSide === "left"
      ? "M 38 76 L 26 92 L 54 78 Z"
      : "M 182 76 L 194 92 L 166 78 Z";

  return (
    <svg
      viewBox="0 0 220 92"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
    >
      <path
        d="M 15 19 C 9 11 21 4 36 5 C 72 1 149 3 191 9 C 209 11 213 21 210 33 C 214 49 207 67 194 74 C 159 81 88 79 49 76 C 27 75 11 69 9 54 C 5 39 9 27 15 19 Z"
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
