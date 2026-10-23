export const MONEYSMART_URL = "https://moneysmart.gov.au";
export const MONEYSMART_LABEL = "Moneysmart";
export const NATIONAL_DEBT_HELPLINE = "1800 007 007";
export const NATIONAL_DEBT_HELPLINE_NAME = "National Debt Helpline";

export type AskIntent =
  | "totals"
  | "list"
  | "dates"
  | "upcoming_bills"
  | "category_sums"
  | "goal_progress";

export type AiJob =
  | "structure_record"
  | "summarise_typed"
  | "explain_figures"
  | "frame_decision"
  | "ask";

export type AskGuardReason =
  | "advice"
  | "product"
  | "debt"
  | "super"
  | "investment"
  | "unmatched";

export type AskGuardResult =
  | { allowed: true; intent: AskIntent }
  | {
      allowed: false;
      reasons: AskGuardReason[];
      message: string;
      resources: string[];
    };

const BLOCKS: { reason: AskGuardReason; pattern: RegExp }[] = [
  {
    reason: "advice",
    pattern:
      /\b(should|ought|recommend\w*|suggest\w*|better|good idea|smart to|worth it|right for|suitab\w*|afford\w*|cope|okay|ok|safe to spend|feel tight|feels tight|fits|what would you|which is better|how are we|are we|am i|id suggest|i suggest|consider switching|you can afford)\b/,
  },
  {
    reason: "product",
    pattern:
      /\b(vanguard|hostplus|betashares|commsec|stake|afterpay|which (bank|fund|product|card|loan|platform)|what product)\b/,
  },
  {
    reason: "debt",
    pattern:
      /\b(debt|mortgage|refinance\w*|credit card|personal loan|home loan|bnpl|buy now pay later|hardship|consolidat\w*|pay off|credit)\b/,
  },
  { reason: "super", pattern: /\b(superannuation|super)\b/ },
  {
    reason: "investment",
    pattern: /\b(invest\w*|shares|stocks|etf|portfolio|crypto|insurance)\b/,
  },
];

const ALLOW: { intent: AskIntent; pattern: RegExp }[] = [
  {
    intent: "upcoming_bills",
    pattern:
      /^(?:show |list )?(?:upcoming bills|bills that are due|which bills are due(?: this month| next month)?|what bills are due(?: this month| next month)?|when is the next [a-z0-9 ]+ bill due)$/,
  },
  {
    intent: "category_sums",
    pattern:
      /^(?:what is |whats |show |list )?(?:the )?(?:sum|sums|total|totals) by category(?: of (?:the )?(?:bills|income|transactions))?$/,
  },
  {
    intent: "goal_progress",
    pattern:
      /^(?:what|which) amounts have been entered for goals$|^(?:what is |whats |show |list )?(?:the |my |our )?(?:goal|goals)(?: progress| amounts| current and target)?(?: i entered| entered| typed)?$|^list (?:the |my |our )?goals(?: i entered| entered| typed)?$/,
  },
  {
    intent: "dates",
    pattern:
      /^(?:when is|when are|what date is|what dates are) (?:the |my |our )?(?:next )?[a-z0-9 ]+$/,
  },
  {
    intent: "totals",
    pattern:
      /^(?:what is|whats|what are|how much is|how much are|show) (?:the |my |our )?(?:total|sum|amount)(?: of| for)?(?: the | my | our )?(?:[a-z0-9]+(?: [a-z0-9]+)*)?$|^how much is (?:the |my |our )?[a-z0-9 ]+ bill$/,
  },
  {
    intent: "list",
    pattern:
      /^(?:list|show|what are|what|which) (?:the |my |our )?(?:bills|bill|income amounts|incomes|income|transactions|notes|goals)(?: i entered| i typed| entered| typed| did i enter| are entered)?$|^what bills did i enter$|^list the income amounts and dates i typed$|^(?:the |my |our )?(?:bills|income|goals)$/,
  },
];

const POLITE = /^(?:please|can you|could you|would you|show me|tell me)\s+/;

const EXPLAIN =
  /^(?:explain|summarise|summarize|describe) (?:the |my |our )?(?:figures|numbers|bills|income|goals|what i typed)\b/;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPolite(text: string): string {
  let current = text;
  for (let i = 0; i < 4; i += 1) {
    const next = current.replace(POLITE, "").trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

function blockReasons(text: string): AskGuardReason[] {
  const reasons: AskGuardReason[] = [];
  for (const block of BLOCKS) {
    if (block.pattern.test(text) && !reasons.includes(block.reason)) {
      reasons.push(block.reason);
    }
  }
  return reasons;
}

export function refusalMessage(_reasons: AskGuardReason[] = []): string {
  return [
    "Life CFO only lists figures, dates, and items you typed. It does not say what you should do, and it does not suggest products.",
    `For free official information, see ${MONEYSMART_LABEL} at ${MONEYSMART_URL}.`,
    `If you are worried about debt, contact the ${NATIONAL_DEBT_HELPLINE_NAME} on ${NATIONAL_DEBT_HELPLINE}.`,
  ].join(" ");
}

function refuse(reasons: AskGuardReason[]): AskGuardResult {
  const listed = reasons.length > 0 ? reasons : (["unmatched"] as AskGuardReason[]);
  return {
    allowed: false,
    reasons: listed,
    message: refusalMessage(listed),
    resources: [
      `${MONEYSMART_LABEL} ${MONEYSMART_URL}`,
      `${NATIONAL_DEBT_HELPLINE_NAME} ${NATIONAL_DEBT_HELPLINE}`,
    ],
  };
}

function matchAllow(text: string): AskIntent | null {
  for (const rule of ALLOW) {
    if (rule.pattern.test(text)) return rule.intent;
  }
  return null;
}

/** Fail closed. Only a full-string factual intent is allowed. A block word wins over an allow pattern. */
export function guardAskQuestion(question: string): AskGuardResult {
  const normalized = stripPolite(normalize(question));
  if (!normalized) return refuse(["unmatched"]);
  const reasons = blockReasons(normalized);
  if (reasons.length > 0) return refuse(reasons);
  const intent = matchAllow(normalized);
  if (!intent) return refuse(["unmatched"]);
  return { allowed: true, intent };
}

/**
 * Job-scoped pre-check.
 * structure_record and frame_decision allow messy notes that are not advice-seeking.
 * explain_figures and summarise_typed need a factual ask or a narrow explain/summarise wording.
 */
const CAPTURE_ADVICE =
  /\b(should|ought|recommend\w*|suggest\w*|better|good idea|smart to|worth it|right for|suitab\w*|afford\w*|cope|okay|ok|what would you|which is better|how are we|are we|id suggest|i suggest|consider switching|you can afford)\b/;

const CAPTURE_PRODUCT =
  /\b(vanguard|hostplus|betashares|commsec|stake|afterpay|which (bank|fund|product|card|loan|platform)|what product)\b/;

/** Brain-dump capture blocks advice and product names. A bill labelled insurance or rego is still a typed item. */
function captureReasons(text: string): AskGuardReason[] {
  const reasons: AskGuardReason[] = [];
  if (CAPTURE_ADVICE.test(text)) reasons.push("advice");
  if (CAPTURE_PRODUCT.test(text)) reasons.push("product");
  return reasons;
}

export function guardAiInput(text: string, job: AiJob): AskGuardResult {
  if (job === "ask") return guardAskQuestion(text);
  const normalized = stripPolite(normalize(text));
  if (!normalized) return refuse(["unmatched"]);
  const reasons = job === "structure_record" ? captureReasons(normalized) : blockReasons(normalized);
  if (reasons.length > 0) return refuse(reasons);
  if (job === "explain_figures" || job === "summarise_typed") {
    const ask = guardAskQuestion(text);
    if (ask.allowed) return ask;
    if (EXPLAIN.test(normalized)) {
      return { allowed: true, intent: job === "explain_figures" ? "totals" : "list" };
    }
    return refuse(["unmatched"]);
  }
  return { allowed: true, intent: "list" };
}
