export function cleanLines(values: Array<string | null | undefined>) {
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function section(title: string, items: Array<string | null | undefined>) {
  const cleaned = cleanLines(items);
  if (!cleaned.length) return null;
  return `${title}\n- ${cleaned.join("\n- ")}`;
}

export function paragraph(...parts: Array<string | null | undefined>) {
  return cleanLines(parts).join(" ");
}

export function composeMessage(sections: Array<string | null | undefined>) {
  return cleanLines(sections).join("\n\n");
}

type StableGroundMode =
  | "snapshot"
  | "diagnosis"
  | "planning"
  | "affordability"
  | "scenario"
  | "search";

type AskLanguageContext = {
  pressure: "elevated" | "moderate" | "low" | "unknown";
  data: "stale" | "fresh" | "unknown";
  evidence: "thin" | "clear";
};

type StableGroundParams = {
  mode: StableGroundMode;
  hasCaveat?: boolean;
  hasEvidence?: boolean;
  context?: AskLanguageContext;
};

function includesAny(haystack: string, needles: string[]) {
  return needles.some((n) => haystack.includes(n));
}

export function deriveAskLanguageContext(params: {
  lines: string[];
  hasEvidence?: boolean;
  hasCaveat?: boolean;
}): AskLanguageContext {
  const joined = cleanLines(params.lines).join(" ").toLowerCase();
  const hasEvidence = params.hasEvidence !== false;
  const hasCaveat = params.hasCaveat === true;

  const pressure: AskLanguageContext["pressure"] = includesAny(joined, [
    "consume most",
    "large share",
    "exceed available cash",
    "strain cash",
    "well above",
    "feel heavy",
    "feel tight",
  ])
    ? "elevated"
    : includesAny(joined, [
        "meaningful share",
        "mixed",
        "may strain",
        "moderately above",
      ])
      ? "moderate"
      : includesAny(joined, [
          "leave room",
          "adequate",
          "mostly stable",
          "appear stable",
          "at or below",
          "recently synced",
        ])
        ? "low"
        : "unknown";

  const data: AskLanguageContext["data"] = includesAny(joined, [
    "stale",
    "out of date",
    "needs a refresh",
    "may need a refresh",
  ])
    ? "stale"
    : includesAny(joined, [
        "recently synced",
        "current demo data",
        "demo transactions are current",
        "appear stable",
        "adequate",
      ])
      ? "fresh"
      : "unknown";

  const evidenceThinFromText = includesAny(joined, [
    "cannot be assessed",
    "not set up yet",
    "missing",
    "no active",
    "no recurring",
  ]);

  const evidence: AskLanguageContext["evidence"] =
    !hasEvidence || hasCaveat || evidenceThinFromText ? "thin" : "clear";

  return { pressure, data, evidence };
}

export function stableGroundLine(params: StableGroundParams) {
  if (params.mode === "search") {
    return params.hasEvidence === false
      ? "No matching typed records were found for that wording."
      : "These rows are what was found in the typed records.";
  }
  return "These lines restate figures that were entered.";
}
