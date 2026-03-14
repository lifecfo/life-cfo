import { FinancialSnapshot } from "./buildFinancialSnapshot";

export type PressureKey =
  | "structural"
  | "discretionary"
  | "timing"
  | "stability"
  | "none";

export type PressureInterpretation = {
  main_pressure: {
    key: PressureKey;
    level: "none" | "low" | "medium" | "high";
    summary: string;
    why_now: string;
  };
  secondary_pressure?: {
    key: Exclude<PressureKey, "none">;
    level: "low" | "medium" | "high";
    summary: string;
  };
  what_to_ask_next: string[];
  confidence: {
    freshness: "fresh" | "stale" | "no_connections";
    evidence: "clear" | "limited";
    note: string;
  };
};

type SignalDetail = {
  key: Exclude<PressureKey, "none">;
  score: number;
  level: "none" | "low" | "medium" | "high";
  summary: string;
  drivers: string[];
};

function normalizeSentence(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = item.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function buildSignalDetails(snapshot: FinancialSnapshot): SignalDetail[] {
  const p = snapshot.pressure;
  return [
    {
      key: "structural",
      score: p.structural_pressure.score,
      level: p.structural_pressure.level,
      summary: normalizeSentence(p.structural_pressure.summary),
      drivers: p.structural_pressure.drivers ?? [],
    },
    {
      key: "discretionary",
      score: p.discretionary_drift.score,
      level: p.discretionary_drift.level,
      summary: normalizeSentence(p.discretionary_drift.summary),
      drivers: p.discretionary_drift.drivers ?? [],
    },
    {
      key: "timing",
      score: p.timing_mismatch.score,
      level: p.timing_mismatch.level,
      summary: normalizeSentence(p.timing_mismatch.summary),
      drivers: p.timing_mismatch.drivers ?? [],
    },
    {
      key: "stability",
      score: p.stability_risk.score,
      level: p.stability_risk.level,
      summary: normalizeSentence(p.stability_risk.summary),
      drivers: p.stability_risk.drivers ?? [],
    },
  ].sort((a, b) => b.score - a.score);
}

function plainWhyNow(main: SignalDetail, snapshot: FinancialSnapshot): string {
  const driver = normalizeSentence(main.drivers[0]);
  if (driver) return driver;

  switch (main.key) {
    case "structural":
      return snapshot.income.recurringMonthlyCents > 0
        ? "A large share of regular income is already tied up in regular bills."
        : "Regular bills are tracked, but regular income is not fully mapped yet.";
    case "discretionary":
      return "Recent flexible spending looks higher than the prior period.";
    case "timing":
      return "Some bills are landing before the next income and that can create short-term pressure.";
    case "stability":
      return "Data freshness or income coverage is mixed, so confidence is a bit lower.";
    default:
      return "No strong pressure signal is standing out right now.";
  }
}

function basePromptForKey(key: PressureKey): string[] {
  switch (key) {
    case "structural":
      return [
        "Where could we create a little more breathing room in regular bills?",
        "How tight are we after regular bills each month?",
      ];
    case "discretionary":
      return [
        "What changed in our recent spending?",
        "Where has spending drifted up lately?",
      ];
    case "timing":
      return [
        "What is coming up before the next income?",
        "How can we smooth the next few weeks?",
      ];
    case "stability":
      return [
        "How much could data freshness be affecting this view?",
        "Which account connections should we refresh first?",
      ];
    default:
      return [
        "Are we okay this month?",
        "What should we keep in mind for the next few weeks?",
      ];
  }
}

function deriveFreshness(snapshot: FinancialSnapshot):
  | "fresh"
  | "stale"
  | "no_connections" {
  if (snapshot.connections.total === 0) return "no_connections";
  if (snapshot.connections.stale > 0) return "stale";
  return "fresh";
}

function deriveEvidence(snapshot: FinancialSnapshot, main: SignalDetail): "clear" | "limited" {
  if (snapshot.connections.total === 0) return "limited";
  if (snapshot.connections.stale > 0) return "limited";
  if (main.level === "none" || main.score < 0.2) return "limited";
  if (snapshot.income.sourceCount === 0 && snapshot.commitments.billCount === 0) return "limited";
  return "clear";
}

function confidenceNote(
  freshness: "fresh" | "stale" | "no_connections",
  evidence: "clear" | "limited"
): string {
  if (freshness === "stale") {
    return "Some connected data may be out of date, but this is still a useful read of where things stand.";
  }
  if (freshness === "no_connections") {
    return "This view is based on current setup data, so treat it as a starting point while connections are still being added.";
  }
  if (evidence === "limited") {
    return "This is a useful first read, and a little more data will make it sharper.";
  }
  return "This read is based on recent connected household data and should be a solid guide for your next question.";
}

export function interpretPressure(snapshot: FinancialSnapshot): PressureInterpretation {
  const ranked = buildSignalDetails(snapshot);
  const strongest = ranked[0];

  const mainIsNone = !strongest || strongest.level === "none" || strongest.score < 0.15;
  const mainPressure: PressureInterpretation["main_pressure"] = mainIsNone
    ? {
        key: "none",
        level: "none",
        summary: "No major pressure signal is standing out right now.",
        why_now: "Regular income, commitments, timing, and data stability look reasonably balanced from this snapshot.",
      }
    : {
        key: strongest.key,
        level: strongest.level,
        summary: strongest.summary,
        why_now: plainWhyNow(strongest, snapshot),
      };

  const secondaryCandidate = ranked.find(
    (signal) =>
      signal.key !== mainPressure.key &&
      signal.level !== "none" &&
      signal.score >= 0.3
  );

  const secondaryPressure = secondaryCandidate
    ? {
        key: secondaryCandidate.key,
        level: secondaryCandidate.level as "low" | "medium" | "high",
        summary: secondaryCandidate.summary,
      }
    : undefined;

  const freshness = deriveFreshness(snapshot);
  const evidence = deriveEvidence(snapshot, strongest);

  const prompts = unique([
    ...basePromptForKey(mainPressure.key),
    ...(secondaryPressure ? basePromptForKey(secondaryPressure.key) : []),
    freshness === "stale"
      ? "How much could stale connection data be affecting this view?"
      : freshness === "no_connections"
        ? "What will become clearer after we connect accounts?"
        : "What should we focus on next to keep things steady?",
  ]).slice(0, 3);

  return {
    main_pressure: mainPressure,
    secondary_pressure: secondaryPressure,
    what_to_ask_next: prompts,
    confidence: {
      freshness,
      evidence,
      note: confidenceNote(freshness, evidence),
    },
  };
}
