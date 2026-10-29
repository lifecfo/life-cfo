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
  {
    name: "suitability",
    // "smart" only counts as a judgment when it's paired with a decision
    // noun (a smart choice/move/one to keep) -- bare, it's too common in
    // provider/bill names ("Smart TV subscription", "Smart Energy") to use
    // as a blanket match.
    pattern: /\b(?:suitable for|right for you|good idea|worth it|smart(?:er|est)?\s+(?:choice|move|one|thing|idea|decision|option|way))\b/i,
  },
  { name: "ranking", pattern: /\b(?:best option|better option|i['’]?d go with|id go with|i would choose)\b/i },
  {
    name: "reassurance_verdict",
    // "on track" only counts as a judgment when something is reported as
    // being on track -- bare, it collides with business names like
    // "On Track Physio".
    pattern: /\b(?:(?:look(?:s|ing)?|is|are|you'?re|we'?re)\s+on track|no changes needed)\b/i,
  },
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

// Purposes whose system prompt already constrains output to the household's
// own typed/extracted data (structure_record, read_receipt) or to a
// FACTS-PACK-only JSON schema (home_ask) -- bare mentions of these topic
// words are trusted to be literal bill/provider names in these purposes,
// not AI-generated guidance. The should/recommend/better/afford/
// suitability/ranking/product/debt_guidance patterns stay active regardless
// of purpose, so actual advice about insurance/super/investment is still
// caught (e.g. "you should get more insurance" still blocks on "should").
const TOPIC_WORD_EXEMPT_PURPOSES = new Set(["structure_record", "read_receipt", "home_ask"]);
const TOPIC_WORD_PATTERNS = new Set(["super_guidance", "investment_guidance", "insurance_guidance"]);

export function screenAiOutput(text: string, options?: { purpose?: string }): OutputScreen {
  const patterns = ADVICE_PATTERNS.filter((rule) => {
    if (
      options?.purpose &&
      TOPIC_WORD_EXEMPT_PURPOSES.has(options.purpose) &&
      TOPIC_WORD_PATTERNS.has(rule.name)
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
