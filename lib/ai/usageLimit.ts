export const AI_USER_DAILY_LIMIT_MESSAGE =
  "You've used today's AI limit for the beta. It resets at midnight.";

export const AI_TOTAL_DAILY_LIMIT_MESSAGE =
  "AI is resting for today in the beta. Try again tomorrow.";

export const AI_USAGE_UNAVAILABLE_MESSAGE = "AI isn't available right now.";

export const AI_MAX_OUTPUT_TOKENS = 600;
export const AI_MAX_PROMPT_CHARS = 8000;

const DEFAULT_PER_USER = 15;
const DEFAULT_TOTAL = 200;

export class AiDailyLimitError extends Error {
  readonly scope: "user" | "total";

  constructor(scope: "user" | "total") {
    super(scope === "user" ? AI_USER_DAILY_LIMIT_MESSAGE : AI_TOTAL_DAILY_LIMIT_MESSAGE);
    this.name = "AiDailyLimitError";
    this.scope = scope;
  }
}

export class AiUsageUnavailableError extends Error {
  constructor() {
    super(AI_USAGE_UNAVAILABLE_MESSAGE);
    this.name = "AiUsageUnavailableError";
  }
}

export function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

export function readAiDailyLimits(
  env: Record<string, string | undefined> = process.env
): { perUser: number; total: number } {
  return {
    perUser: readPositiveInt(env.LIFE_CFO_AI_DAILY_LIMIT_PER_USER, DEFAULT_PER_USER),
    total: readPositiveInt(env.LIFE_CFO_AI_DAILY_LIMIT_TOTAL, DEFAULT_TOTAL),
  };
}

/** Calendar day in Australia/Sydney, as YYYY-MM-DD. */
export function sydneyDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function capOutputTokens(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) return AI_MAX_OUTPUT_TOKENS;
  return Math.min(Math.floor(requested), AI_MAX_OUTPUT_TOKENS);
}

export function trimAiPrompt(prompt: string): string {
  if (prompt.length <= AI_MAX_PROMPT_CHARS) return prompt;
  return prompt.slice(0, AI_MAX_PROMPT_CHARS);
}
