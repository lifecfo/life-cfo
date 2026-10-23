// lib/lifecfo/verdict.ts
// Fine-grained verdicts for “should we / can we afford / decision outcomes”.
// Not used for Home check-in tone (that is HomeTone in homeTone.ts).

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
  switch (v) {
    case "CLEAR_YES":
    case "YES_NEEDS_PLANNING":
    case "NOT_YET":
    case "NO":
    case "INSUFFICIENT_DATA":
    default:
      return { label: "Figures entered", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
    case "NEEDS_ATTENTION":
      return { label: "Needs attention", className: "bg-zinc-900 text-white" };
  }
}

/**
 * Canonical verdict sentence patterns (LOCKED voice).
 * Keep verdict sentences short and number-free.
 */
export function verdictSentence(v: Verdict): string {
  switch (v) {
    case "NEEDS_ATTENTION":
      return "Needs attention.";
    case "CLEAR_YES":
    case "YES_NEEDS_PLANNING":
    case "NOT_YET":
    case "NO":
    case "INSUFFICIENT_DATA":
    default:
      return "Life CFO is showing figures that were typed.";
  }
}
