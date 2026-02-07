export type Verdict =
  | "CLEAR_YES"
  | "YES_NEEDS_PLANNING"
  | "NOT_YET"
  | "NEEDS_ATTENTION"
  | "NO"
  | "INSUFFICIENT_DATA";

export type VerdictUI = {
  label: string;
  className: string; // pill styling
};

export function verdictToUI(v: Verdict): VerdictUI {
  // Keep this minimal + calm. No “alarm red” in V1.
  // We’ll later map borders/accents in the design system.
  switch (v) {
    case "CLEAR_YES":
      return { label: "Comfortable", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
    case "YES_NEEDS_PLANNING":
      return { label: "Needs planning", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
    case "NOT_YET":
      return { label: "Not yet", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
    case "NEEDS_ATTENTION":
      return { label: "Needs attention", className: "bg-zinc-900 text-white" };
    case "NO":
      return { label: "Doesn’t fit", className: "bg-zinc-900 text-white" };
    case "INSUFFICIENT_DATA":
      return { label: "Not enough data", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
    default:
      return { label: "Not enough data", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
  }
}

/**
 * Canonical verdict sentence patterns (LOCKED voice).
 * Keep verdict sentences short and number-free.
 */
export function verdictSentence(v: Verdict): string {
  switch (v) {
    case "CLEAR_YES":
      return "Yes — this fits comfortably within your current position.";
    case "YES_NEEDS_PLANNING":
      return "This is achievable, but it would need planning.";
    case "NOT_YET":
      return "Not yet — this would stretch things too far right now.";
    case "NEEDS_ATTENTION":
      return "This needs attention before you commit.";
    case "NO":
      return "No — this doesn’t fit within your current financial reality.";
    case "INSUFFICIENT_DATA":
      return "I don’t have enough information to answer this safely yet.";
    default:
      return "I don’t have enough information to answer this safely yet.";
  }
}
