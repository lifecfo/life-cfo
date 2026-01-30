// lib/safety/crisis.ts

export type CrisisCategory = "self_harm" | "violence" | "dv" | "medical";

export const AU_CRISIS_COPY = [
  "I’m really sorry you’re dealing with this. I can’t help with this inside the app.",
  "",
  "If you’re in immediate danger, please call **000** right now.",
  "",
  "You can reach support in Australia at:",
  "",
  "• **Lifeline** — **13 11 14** — lifeline.org.au",
  "• **Beyond Blue** — **1300 22 4636** — beyondblue.org.au",
  "• **Suicide Call Back Service** — **1300 659 467** — suicidecallbackservice.org.au",
  "• **13YARN** (Aboriginal & Torres Strait Islander) — **13 92 76** — 13yarn.org.au",
  "",
  "You don’t have to handle this alone.",
].join("\n");

function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * V1 conservative detector:
 * - false positives acceptable
 * - avoids diagnosing (only intercepts)
 */
export function detectCrisis(text: string): { hit: true; category: CrisisCategory } | { hit: false } {
  const t = norm(text);
  if (!t) return { hit: false };

  // Strong self-harm language
  const selfHarmStrong = [
    "suicide",
    "kill myself",
    "end my life",
    "i want to die",
    "want to die",
    "i'm going to kill myself",
    "im going to kill myself",
    "self harm",
    "self-harm",
    "cut myself",
    "overdose",
  ];

  // Threats / imminent violence
  const violenceStrong = [
    "kill them",
    "kill him",
    "kill her",
    "going to kill",
    "hurt them",
    "hurt him",
    "hurt her",
    "shoot",
    "stab",
    "i have a gun",
    "i have a knife",
    "going to hurt",
  ];

  // Domestic / family violence
  const dvStrong = [
    "domestic violence",
    "he hit me",
    "she hit me",
    "my partner hit me",
    "my husband hit me",
    "my wife hit me",
    "i'm not safe",
    "im not safe",
    "they are threatening me",
    "they won't let me leave",
    "they wont let me leave",
  ];

  // Medical emergencies (keep small; avoid turning normal symptoms into intercept)
  const medicalStrong = [
    "can't breathe",
    "cant breathe",
    "severe bleeding",
    "unconscious",
    "stroke",
    "chest pain and can't breathe",
    "chest pain and cant breathe",
  ];

  const includesAny = (arr: string[]) => arr.some((k) => t.includes(k));

  if (includesAny(selfHarmStrong)) return { hit: true, category: "self_harm" };
  if (includesAny(violenceStrong)) return { hit: true, category: "violence" };
  if (includesAny(dvStrong)) return { hit: true, category: "dv" };
  if (includesAny(medicalStrong)) return { hit: true, category: "medical" };

  // Weaker “I can't go on” style requires urgency word (reduces false positives)
  const weakSelfHarm = ["can't go on", "cant go on", "no reason to live", "give up"];
  const urgency = ["tonight", "right now", "now", "immediately", "this moment"];

  const weakMatched = weakSelfHarm.some((k) => t.includes(k)) && urgency.some((u) => t.includes(u));
  if (weakMatched) return { hit: true, category: "self_harm" };

  return { hit: false };
}
