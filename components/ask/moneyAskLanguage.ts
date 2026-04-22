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
    "old",
    "cannot be assessed",
    "missing",
    "not set up yet",
    "no active money connections",
    "no connection freshness",
  ])
    ? "stale"
    : includesAny(joined, ["recently synced", "appear stable", "adequate"])
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
  const { mode, hasCaveat = false, hasEvidence = true, context } = params;
  const pressure = context?.pressure ?? "unknown";
  const data = context?.data ?? "unknown";
  const evidence = context?.evidence ?? (hasEvidence ? "clear" : "thin");

  if (mode === "search") {
    return hasEvidence
      ? "These matches give us a clear starting point before narrowing further."
      : "There is not much matching data yet, which still helps narrow the next question.";
  }

  if (data === "stale") {
    return "Some data looks a bit out of date, but there is still enough here to get your bearings.";
  }

  if (hasCaveat || evidence === "thin") {
    return "This still gives useful direction, and a little more detail would sharpen it.";
  }

  switch (mode) {
    case "snapshot":
      return pressure === "elevated"
        ? "It makes sense if this feels heavy right now, and the upside is the pattern is visible."
        : "The picture is fairly clear, which makes the next choices easier to weigh.";
    case "diagnosis":
      return pressure === "elevated"
        ? "This may feel like a lot, but it does not look random."
        : "This gives a clearer read on what is actually driving the pressure.";
    case "planning":
      return "There is enough mapped out here to plan ahead with a bit more confidence.";
    case "affordability":
      return pressure === "elevated"
        ? "There may be pressure here, and this gives you a clear baseline before getting more specific."
        : "This is a solid baseline before getting more specific.";
    case "scenario":
      return evidence === "clear"
        ? "You can treat this as the before picture, then layer the change on top."
        : "There is enough here for a useful first pass before adding more scenario detail.";
    default:
      return null;
  }
}
