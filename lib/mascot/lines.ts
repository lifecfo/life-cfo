/**
 * The cat mascot's speech bubble lines. This is the full, closed set --
 * no other text is ever shown in the bubble. See lines.test.ts, which runs
 * every line through the AI output guard so a future addition can't slip
 * in advice-shaped wording.
 */
export const MASCOT_LINES: readonly string[] = [
  "Nothing's due today. Even the bills are napping.",
  "You don't have to hold it all in your head. That's what I'm for. Well, me and the app.",
  "Small things, written down, stay small.",
  "A renewal you know about is just a date. A surprise one is a story.",
  "Done is cosier than perfect.",
  "Rest is part of the plan.",
  "You checked in. That counts.",
  "Future you says thanks for writing that down.",
  "One shared list beats two worried heads.",
  "If it's on the list, it's off your mind.",
];

export function getRandomMascotLine(): string {
  const index = Math.floor(Math.random() * MASCOT_LINES.length);
  return MASCOT_LINES[index];
}
