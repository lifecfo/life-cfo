// lib/safety/guard.ts
import { AU_CRISIS_COPY, detectCrisis } from "./crisis";

export function maybeCrisisIntercept(userText: string) {
  const res = detectCrisis(userText);
  if (!res.hit) return null;

  return {
    kind: "crisis_intercept" as const,
    category: res.category,
    content: AU_CRISIS_COPY,
  };
}
