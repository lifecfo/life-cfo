import type { Verdict } from "./verdict";

export type LifeCFOAnswerPayload = {
  verdict: Verdict;

  // The “front door”
  verdict_sentence: string;

  // Optional structured fields for rendering
  key_points?: string[]; // max 3
  details?: string;
  assumptions?: string[];
  what_would_change?: string[];

  // existing contract you already use
  action?: "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
  suggested_next?: "none" | "create_capture" | "open_thinking";

  // fallbacks (keep)
  answer?: string;
};
