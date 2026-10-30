import type { IllustratedPose } from "@/components/mascot/IllustratedCat";

/** Small idle behaviours. Never play the same one twice in a row. */
export const SMALL_BEHAVIOURS = ["curious", "lookingback", "grooming", "happy"] as const;
export type SmallBehaviour = (typeof SMALL_BEHAVIOURS)[number];

export const SMALL_HOLD_MS: Record<SmallBehaviour, number> = {
  curious: 3000,
  lookingback: 2000,
  grooming: 4000,
  happy: 3000,
};

/** Fast preview cycle. Walking stays out; the cat does not roam. */
export const DEMO_POSES: readonly IllustratedPose[] = [
  "curious",
  "lookingback",
  "grooming",
  "happy",
  "dozing",
  "lying",
  "stretch",
];

export const DEMO_STEP_MS = 5000;
export const ALERT_RETURN_MS = 2000;

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pickSmallBehaviour(previous: SmallBehaviour | null): SmallBehaviour {
  const pool = SMALL_BEHAVIOURS.filter((name) => name !== previous);
  return pool[Math.floor(Math.random() * pool.length)] ?? "curious";
}

export function nextSmallGapMs(): number {
  return randomBetween(30_000, 90_000);
}

export function nextRestGapMs(): number {
  return randomBetween(3 * 60_000, 6 * 60_000);
}

export function nextStretchGapMs(): number {
  return randomBetween(8 * 60_000, 10 * 60_000);
}

export function dozingHoldMs(): number {
  return randomBetween(20_000, 40_000);
}

export function lyingHoldMs(): number {
  return randomBetween(60_000, 120_000);
}

export const STRETCH_HOLD_MS = 2000;
