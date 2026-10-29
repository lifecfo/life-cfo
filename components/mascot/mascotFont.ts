import { Patrick_Hand } from "next/font/google";

/** Handwritten-style font for the mascot's speech bubble text only. */
export const mascotHandwrittenFont = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  fallback: ["Comic Sans MS", "cursive"],
});
