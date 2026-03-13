export function cleanLines(values: Array<string | null | undefined>) {
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function section(title: string, items: string[]) {
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

type StableGroundParams = {
  mode: StableGroundMode;
  hasCaveat?: boolean;
  hasEvidence?: boolean;
};

export function stableGroundLine(params: StableGroundParams) {
  const { mode, hasCaveat = false, hasEvidence = true } = params;

  if (mode === "search") {
    return hasEvidence
      ? "This gives you a grounded starting point to ask a more specific follow-up."
      : "There is not much matching data yet, which still helps narrow the next question.";
  }

  if (hasCaveat) {
    return "This is still useful as a baseline, even if a bit more detail would sharpen it.";
  }

  switch (mode) {
    case "snapshot":
      return "Even if parts feel tight, the picture here is clear enough to reason from.";
    case "diagnosis":
      return "The helpful part is that the pressure drivers are identifiable, not random.";
    case "planning":
      return "You have enough mapped to plan ahead without relying on guesswork.";
    case "affordability":
      return "This gives a steady baseline for the decision before adding more specifics.";
    case "scenario":
      return "You now have a stable baseline to compare any scenario details against.";
    default:
      return null;
  }
}
