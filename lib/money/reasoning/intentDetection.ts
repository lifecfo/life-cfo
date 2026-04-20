export type MoneyAskIntentSignals = {
  looksOrientation: boolean;
  looksDiagnosis: boolean;
  looksPlanning: boolean;
  looksAffordability: boolean;
  looksScenario: boolean;
};

const ORIENTATION_KEYWORDS = [
  "are we okay",
  "how are things looking",
  "financial status",
];

const DIAGNOSIS_KEYWORDS = [
  "why does money feel tight",
  "why does money feel",
  "what changed recently",
  "what is the main pressure",
  "main pressure",
  "feel tight",
  "pressure right now",
];

const PLANNING_KEYWORDS = [
  "what should we plan for this month",
  "what should we plan for",
  "plan for this month",
  "what is coming up",
  "what's coming up",
  "what do we need to keep in mind financially",
  "what do we need to keep in mind",
  "keep in mind financially",
];

const AFFORDABILITY_KEYWORDS = [
  "can we afford this",
  "can we afford it",
  "can we afford a house",
  "can we afford",
  "could we manage this payment",
  "could we manage this",
  "would this stretch us too much",
  "would this stretch us",
];

const SCENARIO_KEYWORDS = [
  "what if income drops",
  "what if our income drops",
  "what if income goes down",
  "what if we move",
  "what if we moved",
  "what if we add another bill",
  "what if we add a bill",
  "what if we add another recurring bill",
  "what if we pause saving for a while",
  "what if we pause saving",
  "what if we stop saving for a while",
  "what happens if income drops",
  "what happens if we move",
  "what happens if we add another bill",
  "what happens if we pause saving",
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

export function detectMoneyAskIntent(question: string): MoneyAskIntentSignals {
  const lowerQ = normalizeForIntent(question);
  const hasQuestion = lowerQ.length > 0;

  const looksOrientation =
    !hasQuestion ||
    ORIENTATION_KEYWORDS.some((kw) => lowerQ.includes(kw));
  const looksDiagnosis =
    hasQuestion && DIAGNOSIS_KEYWORDS.some((kw) => lowerQ.includes(kw));
  const looksPlanning =
    hasQuestion &&
    (PLANNING_KEYWORDS.some((kw) => lowerQ.includes(kw)) ||
      hasComingUpPlanningContext(lowerQ));
  const looksAffordability =
    hasQuestion &&
    AFFORDABILITY_KEYWORDS.some((kw) => lowerQ.includes(kw));
  const looksScenario =
    hasQuestion &&
    (SCENARIO_KEYWORDS.some((kw) => lowerQ.includes(kw)) ||
      ((lowerQ.includes("what if") || lowerQ.includes("what happens if")) &&
        hasScenarioTopicHint(lowerQ)));

  return {
    looksOrientation,
    looksDiagnosis,
    looksPlanning,
    looksAffordability,
    looksScenario,
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

  const diagnosisCue =
    /\b(why|pressure|tight|stretched|off|worse|what changed|changed|stress|strain)\b/i.test(lowerQ);

  if (diagnosisCue) return "diagnosis";
  return "snapshot";
}

export function isHomeAffordabilityIntent(question: string): boolean {
  const lowerQ = normalizeForIntent(question);
  if (!lowerQ) return false;
  return /(can we afford|can i afford|should we|safe to spend|is it safe to spend|can i spend|can we spend)\b/.test(
    lowerQ
  );
}
