export const MONEYSMART_URL = "https://moneysmart.gov.au";
export const MONEYSMART_LABEL = "Moneysmart";
export const NATIONAL_DEBT_HELPLINE = "1800 007 007";
export const NATIONAL_DEBT_HELPLINE_NAME = "National Debt Helpline";

export type AskGuardReason = "advice" | "product" | "debt" | "super" | "investment";

export type AskGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      reasons: AskGuardReason[];
      message: string;
      resources: string[];
    };

const ADVICE =
  /\b(should i|should we|what should|ought to|recommend|recommendation|best option|is it worth|good idea|right for me|suitable|suitability|afford|can i afford|can we afford|could i afford|could we afford|are we okay|am i okay|are we ok|fits comfortably|safe to spend|feel tight|feels tight|does this fit|do we look okay|how are we looking)\b/i;

const PRODUCT =
  /\b(which (bank|fund|product|card|loan|platform|account)|vanguard|hostplus|betashares|commsec|stake|afterpay|what product|which super)\b/i;

const DEBT =
  /\b(debt|mortgage|refinance|refinancing|credit card|personal loan|home loan|bnpl|buy now pay later|hardship|consolidat\w*)\b/i;

const SUPER = /\b(superannuation|super)\b/i;

const INVESTMENT =
  /\b(invest|investment|shares|stocks|etf|portfolio|crypto)\b/i;

function reasonsFor(question: string): AskGuardReason[] {
  const reasons: AskGuardReason[] = [];
  if (ADVICE.test(question)) reasons.push("advice");
  if (PRODUCT.test(question)) reasons.push("product");
  if (DEBT.test(question)) reasons.push("debt");
  if (SUPER.test(question)) reasons.push("super");
  if (INVESTMENT.test(question)) reasons.push("investment");
  return reasons;
}

export function refusalMessage(reasons: AskGuardReason[]): string {
  const debt = reasons.includes("debt");
  const lines = [
    "Life CFO only lists figures, dates, and items you typed. It does not say what you should do, and it does not suggest products.",
    `For free official information, see ${MONEYSMART_LABEL} at ${MONEYSMART_URL}.`,
  ];
  if (debt) {
    lines.push(
      `If you are worried about debt, contact the ${NATIONAL_DEBT_HELPLINE_NAME} on ${NATIONAL_DEBT_HELPLINE}.`
    );
  }
  return lines.join(" ");
}

/** Factual questions about typed sums, dates, and lists are allowed. Advice, products, debt, super, and investments are not. */
export function guardAskQuestion(question: string): AskGuardResult {
  const text = question.trim();
  if (!text) return { allowed: true };
  const reasons = reasonsFor(text);
  if (reasons.length === 0) return { allowed: true };
  const resources = [`${MONEYSMART_LABEL} ${MONEYSMART_URL}`];
  if (reasons.includes("debt")) {
    resources.push(`${NATIONAL_DEBT_HELPLINE_NAME} ${NATIONAL_DEBT_HELPLINE}`);
  }
  return {
    allowed: false,
    reasons,
    message: refusalMessage(reasons),
    resources,
  };
}
