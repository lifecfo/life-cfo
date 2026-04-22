export type MoneyAskIntentSignals = {
  looksOrientation: boolean;
  looksDiagnosis: boolean;
  looksPlanning: boolean;
  looksAffordability: boolean;
  looksScenario: boolean;
};

type IntentMode = "snapshot" | "diagnosis" | "planning" | "affordability" | "scenario";

type WeightedSignal = { value: string; weight: number };

const SNAPSHOT_SIGNALS: WeightedSignal[] = [
  { value: "are we okay", weight: 4 },
  { value: "are we ok", weight: 4 },
  { value: "how are things looking", weight: 4 },
  { value: "financial status", weight: 3 },
  { value: "where are we", weight: 3 },
  { value: "how are we", weight: 3 },
  { value: "right now", weight: 2 },
  { value: "how are we tracking", weight: 3 },
  { value: "what's happening", weight: 2 },
  { value: "what is happening", weight: 2 },
];

const DIAGNOSIS_SIGNALS: WeightedSignal[] = [
  { value: "why does money feel tight", weight: 6 },
  { value: "what changed recently", weight: 5 },
  { value: "what changed", weight: 4 },
  { value: "what is the main pressure", weight: 5 },
  { value: "what's driving", weight: 4 },
  { value: "what is driving", weight: 4 },
  { value: "feel tight", weight: 4 },
  { value: "pressure right now", weight: 4 },
  { value: "stretched", weight: 3 },
  { value: "does anything look off", weight: 4 },
  { value: "what's going on with our money", weight: 4 },
  { value: "what is going on with our money", weight: 4 },
];

const PLANNING_SIGNALS: WeightedSignal[] = [
  { value: "what should we plan for this month", weight: 5 },
  { value: "what should we plan for", weight: 4 },
  { value: "plan for this month", weight: 4 },
  { value: "what is coming up", weight: 4 },
  { value: "what's coming up", weight: 4 },
  { value: "what do we need to keep in mind financially", weight: 5 },
  { value: "what do we need to keep in mind", weight: 4 },
  { value: "keep in mind financially", weight: 4 },
  { value: "next month", weight: 3 },
  { value: "upcoming", weight: 3 },
];

const AFFORDABILITY_SIGNALS: WeightedSignal[] = [
  { value: "can we afford this", weight: 6 },
  { value: "can we afford it", weight: 6 },
  { value: "can we afford a house", weight: 6 },
  { value: "can we afford", weight: 5 },
  { value: "could we manage this payment", weight: 5 },
  { value: "could we manage this", weight: 4 },
  { value: "would this stretch us too much", weight: 5 },
  { value: "would this stretch us", weight: 4 },
  { value: "is it safe to", weight: 4 },
  { value: "can we buy", weight: 4 },
  { value: "can i buy", weight: 4 },
];

const SCENARIO_SIGNALS: WeightedSignal[] = [
  { value: "what if income drops", weight: 6 },
  { value: "what if our income drops", weight: 6 },
  { value: "what if income goes down", weight: 6 },
  { value: "what if we move", weight: 5 },
  { value: "what if we moved", weight: 5 },
  { value: "what if we add another bill", weight: 5 },
  { value: "what if we add a bill", weight: 5 },
  { value: "what if we add another recurring bill", weight: 5 },
  { value: "what if we pause saving for a while", weight: 5 },
  { value: "what if we pause saving", weight: 5 },
  { value: "what if we stop saving for a while", weight: 5 },
  { value: "what happens if income drops", weight: 6 },
  { value: "what happens if we move", weight: 5 },
  { value: "what happens if we add another bill", weight: 5 },
  { value: "what happens if we pause saving", weight: 5 },
];

function normalizeForIntent(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasComingUpPlanningContext(lowerQ: string): boolean {
  if (!lowerQ.includes("coming up")) return false;
  const contextHints = [
    "what",
    "month",
    "financial",
    "money",
    "bill",
    "bills",
    "commitment",
    "plan",
    "keep in mind",
  ];
  return contextHints.some((hint) => lowerQ.includes(hint));
}

function hasScenarioTopicHint(lowerQ: string): boolean {
  const hints = [
    "income",
    "move",
    "moving",
    "bill",
    "bills",
    "saving",
    "savings",
    "payment",
    "rent",
    "mortgage",
    "commitment",
  ];
  return hints.some((hint) => lowerQ.includes(hint));
}

function scoreSignals(lowerQ: string, signals: WeightedSignal[]): number {
  return signals.reduce(
    (total, signal) => (lowerQ.includes(signal.value) ? total + signal.weight : total),
    0
  );
}

function hasStrongWhyDiagnosisCue(lowerQ: string): boolean {
  const hasWhy = /\bwhy\b/i.test(lowerQ);
  const hasDiagnosisTopic =
    /\b(tight|stretched|pressure|off|worse|changed|driving|going on|strain|stress)\b/i.test(lowerQ);
  return hasWhy && hasDiagnosisTopic;
}

function scoreIntentModes(lowerQ: string): Record<IntentMode, number> {
  const scores: Record<IntentMode, number> = {
    snapshot: scoreSignals(lowerQ, SNAPSHOT_SIGNALS),
    diagnosis: scoreSignals(lowerQ, DIAGNOSIS_SIGNALS),
    planning: scoreSignals(lowerQ, PLANNING_SIGNALS),
    affordability: scoreSignals(lowerQ, AFFORDABILITY_SIGNALS),
    scenario: scoreSignals(lowerQ, SCENARIO_SIGNALS),
  };

  if (/\bcan (we|i)\s+afford\b/i.test(lowerQ)) scores.affordability += 5;
  if (/\b(is it safe to|safe to spend|can we buy|can i buy)\b/i.test(lowerQ)) {
    scores.affordability += 3;
  }

  if (/\bwhat if\b|\bwhat happens if\b/i.test(lowerQ)) scores.scenario += 5;
  if ((lowerQ.includes("what if") || lowerQ.includes("what happens if")) && hasScenarioTopicHint(lowerQ)) {
    scores.scenario += 3;
  }

  if (/\b(plan|planning|upcoming|next month|this month|coming up)\b/i.test(lowerQ)) {
    scores.planning += 2;
  }
  if (hasComingUpPlanningContext(lowerQ)) scores.planning += 3;

  if (/\b(how are we|where are we|how are things|status|tracking|right now)\b/i.test(lowerQ)) {
    scores.snapshot += 2;
  }
  if (/\b(what's happening|what is happening|what's going on|what is going on)\b/i.test(lowerQ)) {
    scores.snapshot += 1;
  }

  if (/\bwhy\b/i.test(lowerQ)) scores.diagnosis += 2;
  if (hasStrongWhyDiagnosisCue(lowerQ)) scores.diagnosis += 4;
  if (/\b(pressure|putting pressure|feel stretched|feels stretched)\b/i.test(lowerQ)) {
    scores.diagnosis += 3;
  }
  if (/\b(what changed|what's driving|what is driving|main pressure|look off)\b/i.test(lowerQ)) {
    scores.diagnosis += 3;
  }

  // Precedence: affordability and strong diagnosis should override broad snapshot matches.
  if (scores.affordability > 0 && scores.snapshot > 0) scores.affordability += 2;
  if (hasStrongWhyDiagnosisCue(lowerQ) && scores.snapshot > 0) scores.diagnosis += 2;

  return scores;
}

function selectTopIntent(scores: Record<IntentMode, number>): IntentMode | null {
  const ranked = (Object.entries(scores) as Array<[IntentMode, number]>).sort((a, b) => b[1] - a[1]);
  const [topMode, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (topScore < 3) return null;
  if (topScore === secondScore) return null;
  if (topScore - secondScore <= 1) return null;

  return topMode;
}

export function detectMoneyAskIntent(question: string): MoneyAskIntentSignals {
  const lowerQ = normalizeForIntent(question);
  const hasQuestion = lowerQ.length > 0;
  if (!hasQuestion) {
    return {
      looksOrientation: true,
      looksDiagnosis: false,
      looksPlanning: false,
      looksAffordability: false,
      looksScenario: false,
    };
  }

  if (looksLookupStylePrompt(lowerQ) || looksShortKeywordPrompt(lowerQ)) {
    return {
      looksOrientation: false,
      looksDiagnosis: false,
      looksPlanning: false,
      looksAffordability: false,
      looksScenario: false,
    };
  }

  const scores = scoreIntentModes(lowerQ);
  const selected = selectTopIntent(scores);

  return {
    looksOrientation: selected === "snapshot",
    looksDiagnosis: selected === "diagnosis",
    looksPlanning: selected === "planning",
    looksAffordability: selected === "affordability",
    looksScenario: selected === "scenario",
  };
}

function tokenizeQuestion(input: string): string[] {
  return normalizeForIntent(input)
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function looksLookupStylePrompt(lowerQ: string): boolean {
  const hasLookupVerb = /\b(find|show|list|search|lookup|look up|get|pull up)\b/i.test(lowerQ);
  const hasRecordNoun =
    /\b(transaction|transactions|merchant|merchants|bill|bills|account|accounts|charge|charges|payment|payments|subscription|subscriptions|category|categories)\b/i.test(
      lowerQ
    );
  const hasLookupPattern =
    /\bwhat transactions\b|\bwhich transactions\b|\bshow me\b|\blist\b|\bfind\b|\bsearch\b/i.test(
      lowerQ
    );

  return (hasLookupVerb && hasRecordNoun) || hasLookupPattern;
}

function looksShortKeywordPrompt(lowerQ: string): boolean {
  const tokens = tokenizeQuestion(lowerQ);
  if (tokens.length === 0 || tokens.length > 3) return false;

  const analyticalCue =
    /\b(why|how|are|is|does|what|okay|ok|tight|stretched|pressure|tracking|off|happening)\b/i.test(
      lowerQ
    );
  if (analyticalCue) return false;

  return true;
}

function looksAnalyticalPrompt(lowerQ: string): boolean {
  return /\b(why|how|are we|are our|what's going on|what is going on|what's happening|what is happening|does anything look off|look off|pressure|tight|stretched|tracking|how are we|hows our|how's our|are we okay|are we ok|worse|breathing room)\b/i.test(
    lowerQ
  );
}

export function detectReasoningFallbackMode(question: string): "diagnosis" | "snapshot" | null {
  const lowerQ = normalizeForIntent(question);
  if (!lowerQ.trim()) return "snapshot";
  if (looksLookupStylePrompt(lowerQ) || looksShortKeywordPrompt(lowerQ)) return null;
  if (!looksAnalyticalPrompt(lowerQ)) return null;

  const scores = scoreIntentModes(lowerQ);
  const diagnosisScore = scores.diagnosis;
  const snapshotScore = scores.snapshot;
  if (diagnosisScore >= Math.max(3, snapshotScore + 1)) return "diagnosis";
  return "snapshot";
}

export function isHomeAffordabilityIntent(question: string): boolean {
  const lowerQ = normalizeForIntent(question);
  if (!lowerQ) return false;
  return /(can we afford|can i afford|should we|safe to spend|is it safe to spend|can i spend|can we spend)\b/.test(
    lowerQ
  );
}
