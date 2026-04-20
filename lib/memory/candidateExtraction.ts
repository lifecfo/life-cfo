import type {
  AskCandidatePayload,
  AssumptionCandidate,
  CandidateType,
  ConfidenceLabel,
  DecisionCandidate,
  InsightCandidate,
  ReviewPointCandidate,
} from "@/lib/memory/contracts";

type BaseInput = {
  userId: string | null;
  householdId: string | null;
};

type MoneyCandidateInput = BaseInput & {
  mode: "diagnosis" | "planning" | "affordability" | "scenario";
  question: string;
  headline: string;
  summary: string;
  drivers?: string[];
  signals?: string[];
  upcoming?: string[];
  caveat?: string;
};

type HomeReviewCandidateInput = BaseInput & {
  question: string;
  reviewCount: number;
  firstReviewAt: string | null;
};

type HomeDecisionCandidateInput = BaseInput & {
  question: string;
  action: string;
  suggestedNext: string;
  headline: string;
  details: string;
};

type CandidateBase = {
  id: string;
  thread_id: string | null;
  message_id: string | null;
  household_id: string | null;
  user_id: string | null;
  title: string;
  summary: string;
  confidence: ConfidenceLabel;
  status: "draft";
  created_at: string;
  expires_at: string | null;
  evidence_refs: [];
};

function makeId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // no-op
  }
  return `cand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function inDaysIso(days: number) {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return t.toISOString();
}

function limitText(input: string, max: number) {
  const safe = (input || "").trim();
  if (safe.length <= max) return safe;
  return `${safe.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function firstSentence(input: string) {
  const safe = (input || "").trim();
  if (!safe) return "";
  const sentence = safe.split(/(?<=[.!?])\s+/)[0] || safe;
  return limitText(sentence, 220);
}

function baseCandidate(input: BaseInput, candidateType: CandidateType, title: string, summary: string, confidence: ConfidenceLabel): CandidateBase {
  return {
    id: makeId(),
    thread_id: null,
    message_id: null,
    household_id: input.householdId ?? null,
    user_id: input.userId ?? null,
    title: limitText(title, 160),
    summary: limitText(summary, 260),
    confidence,
    status: "draft",
    created_at: new Date().toISOString(),
    expires_at: inDaysIso(14),
    evidence_refs: [],
  };
}

function hasStrongDecisionSignal(input: HomeDecisionCandidateInput) {
  const q = input.question.toLowerCase();
  if (input.action === "open_decisions") return true;
  if (/\b(decide|decision|choice|options?|trade-?off)\b/.test(q)) return true;
  return false;
}

function buildMoneyInsightCandidate(input: MoneyCandidateInput): InsightCandidate | null {
  if (!input.headline.trim() || !input.summary.trim()) return null;

  if (input.mode === "diagnosis" && (!input.drivers || input.drivers.length === 0)) return null;
  if (input.mode === "planning" && (!input.upcoming || input.upcoming.length === 0)) return null;
  if ((input.mode === "affordability" || input.mode === "scenario") && (!input.signals || input.signals.length === 0)) return null;

  const draftStatement =
    input.mode === "diagnosis"
      ? `${firstSentence(input.summary)} ${limitText((input.drivers || []).slice(0, 2).join(" "), 180)}`.trim()
      : input.mode === "planning"
        ? `${firstSentence(input.summary)} ${limitText((input.upcoming || []).slice(0, 2).join(" "), 180)}`.trim()
        : `${firstSentence(input.summary)} ${limitText((input.signals || []).slice(0, 2).join(" "), 180)}`.trim();

  if (!draftStatement) return null;

  const base = baseCandidate(input, "insight_candidate", input.headline, firstSentence(input.summary), "medium");
  return {
    ...base,
    candidate_type: "insight_candidate",
    draft: {
      title: limitText(input.headline, 140),
      statement: limitText(draftStatement, 400),
      confidence: "medium",
    },
  };
}

function buildCaveatAssumption(input: MoneyCandidateInput): AssumptionCandidate | null {
  const caveat = (input.caveat || "").trim();
  if (!caveat) return null;

  const normalized = caveat.toLowerCase();
  const strongAssumption =
    normalized.includes("not fully mapped") ||
    normalized.includes("broad") ||
    normalized.includes("stale") ||
    normalized.includes("timing");
  if (!strongAssumption) return null;

  const base = baseCandidate(input, "assumption_candidate", "Interpretation assumption", firstSentence(caveat), "low");
  return {
    ...base,
    candidate_type: "assumption_candidate",
    draft: {
      title: "Interpretation assumption",
      statement: limitText(firstSentence(caveat), 320),
      confidence: "low",
    },
  };
}

export function extractMoneyAskCandidates(input: MoneyCandidateInput): AskCandidatePayload | undefined {
  const insight = buildMoneyInsightCandidate(input);
  const assumption = buildCaveatAssumption(input);

  const payload: AskCandidatePayload = {};
  if (insight) payload.insight_candidates = [insight];
  if (assumption) payload.assumption_candidates = [assumption];

  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function extractHomeReviewCandidates(input: HomeReviewCandidateInput): AskCandidatePayload | undefined {
  if (input.reviewCount <= 0 || !input.firstReviewAt) return undefined;

  const base = baseCandidate(
    input,
    "revisit_candidate",
    input.reviewCount === 1 ? "Decision review due" : `${input.reviewCount} decisions due for review`,
    "Review timing is already set on at least one active decision.",
    "medium"
  );

  const reviewPoint: ReviewPointCandidate = {
    ...base,
    candidate_type: "revisit_candidate",
    draft: {
      title: base.title,
      trigger_type: "time",
      condition_text: "Review due date reached",
      trigger_at: input.firstReviewAt,
    },
  };

  return {
    revisit_candidates: [reviewPoint],
  };
}

export function extractHomeDecisionCandidates(input: HomeDecisionCandidateInput): AskCandidatePayload | undefined {
  if (!hasStrongDecisionSignal(input)) return undefined;
  if (!input.headline.trim()) return undefined;

  const rationale = firstSentence(input.details) || firstSentence(input.headline);
  if (!rationale) return undefined;

  const base = baseCandidate(input, "decision_candidate", input.headline, rationale, "medium");
  const decision: DecisionCandidate = {
    ...base,
    candidate_type: "decision_candidate",
    draft: {
      title: limitText(input.headline, 140),
      rationale: limitText(rationale, 360),
      status: "open",
    },
  };

  return {
    decision_candidates: [decision],
  };
}
