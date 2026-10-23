import { refusalMessage } from "@/lib/ask/askGuard";

export const AI_OUTPUT_REFUSAL = refusalMessage(["advice"]);

const ADVICE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "should", pattern: /\bshould\b/i },
  { name: "ought", pattern: /\bought\b/i },
  { name: "recommend", pattern: /\brecommend\w*/i },
  { name: "better_to", pattern: /\bbetter to\b/i },
  { name: "better", pattern: /\bbetter\b/i },
  { name: "suggest", pattern: /\b(?:i['’]?d suggest|id suggest|i suggest|i would suggest)\b/i },
  { name: "afford", pattern: /\b(?:you can afford|you cannot afford|you can't afford|can afford|affordable|affordability)\b/i },
  { name: "consider_switching", pattern: /\bconsider switching\b/i },
  { name: "suitability", pattern: /\b(?:suitable for|right for you|good idea)\b/i },
  { name: "ranking", pattern: /\b(?:best option|better option|i['’]?d go with|id go with|i would choose)\b/i },
  { name: "product", pattern: /\b(?:vanguard|hostplus|betashares|commsec|stake|afterpay)\b/i },
  { name: "debt_guidance", pattern: /\b(?:refinance|consolidat\w*|pay off your|pay off the)\b/i },
  { name: "super_guidance", pattern: /\b(?:superannuation|super fund|super)\b/i },
  { name: "investment_guidance", pattern: /\b(?:invest(?:ment|ing)?|shares|stocks|etf|portfolio|crypto)\b/i },
  { name: "insurance_guidance", pattern: /\binsurance\b/i },
];

export type OutputScreen =
  | { ok: true }
  | { ok: false; patterns: string[]; replacement: string; redacted: string };

/** Strip dollar amounts and numbers so a blocked answer can be logged without household figures. */
export function redactFigures(text: string): string {
  return text
    .replace(/[$£€]\s?\d[\d,]*(?:\.\d+)?/g, "[n]")
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, "[n]");
}

const STRUCTURE_SKIP = new Set(["super_guidance", "investment_guidance", "insurance_guidance"]);

export function screenAiOutput(text: string, options?: { purpose?: string }): OutputScreen {
  const patterns = ADVICE_PATTERNS.filter((rule) => {
    if (
      (options?.purpose === "structure_record" || options?.purpose === "read_receipt") &&
      STRUCTURE_SKIP.has(rule.name)
    ) {
      return false;
    }
    return rule.pattern.test(text);
  }).map((rule) => rule.name);
  if (patterns.length === 0) return { ok: true };
  const redacted = redactFigures(text);
  return {
    ok: false,
    patterns,
    replacement: AI_OUTPUT_REFUSAL,
    redacted,
  };
}

export function logBlockedOutput(purpose: string, screened: { patterns: string[]; redacted: string }): void {
  console.info(
    JSON.stringify({
      event: "ai_output_blocked",
      purpose,
      patterns: screened.patterns,
      redacted: screened.redacted,
    })
  );
}
