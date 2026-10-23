export const DECISION_PACK_NOTE =
  "This pack is a copy of what the household typed. It is for taking to your own broker, accountant, or adviser. It contains no recommendation.";

export type PackItem = {
  title: string;
  kind: string;
  amount_cents: number | null;
  currency: string;
  due_on: string | null;
};

export type DecisionPackInput = {
  title: string;
  statement: string;
  factors: string[];
  questions: string[];
  review_on: string | null;
  items: PackItem[];
};

const FACTOR_LINE = /^(?:[-*•]\s*)?(?:factor|factors)\s*[:\-–]\s*(.+)$/i;
const QUESTION_LINE = /^(?:[-*•]\s*)?(?:question|questions)\s*[:\-–]\s*(.+)$/i;

/** Lines the household marked as a factor or a question. Unmarked lines stay in the statement. */
export function recordedFactorsAndQuestions(texts: string[]): {
  factors: string[];
  questions: string[];
  other_notes: string[];
} {
  const factors: string[] = [];
  const questions: string[] = [];
  const other_notes: string[] = [];
  for (const text of texts) {
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const factor = trimmed.match(FACTOR_LINE);
      const question = trimmed.match(QUESTION_LINE);
      if (factor?.[1]) factors.push(factor[1].trim());
      else if (question?.[1]) questions.push(question[1].trim());
      else other_notes.push(trimmed);
    }
  }
  return {
    factors: factors.slice(0, 12),
    questions: questions.slice(0, 12),
    other_notes: other_notes.slice(0, 20),
  };
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
  );
}

/** Shared words between the decision text and an item title. This is a text match, not a judgement. */
export function itemsMatchingDecision(decisionText: string, items: PackItem[]): PackItem[] {
  const wanted = words(decisionText);
  return items.filter((item) =>
    item.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((word) => word.length >= 4 && wanted.has(word))
  );
}

export function buildDecisionPack(input: DecisionPackInput): {
  title: string;
  statement: string;
  factors: string[];
  questions: string[];
  review_on: string | null;
  matched_items: PackItem[];
  note: string;
} {
  const statement = input.statement.trim() || input.title.trim();
  return {
    title: input.title.trim() || "Untitled decision",
    statement,
    factors: input.factors.map((item) => item.trim()).filter(Boolean).slice(0, 12),
    questions: input.questions.map((item) => item.trim()).filter(Boolean).slice(0, 12),
    review_on: input.review_on,
    matched_items: itemsMatchingDecision(`${input.title}\n${statement}`, input.items),
    note: DECISION_PACK_NOTE,
  };
}
