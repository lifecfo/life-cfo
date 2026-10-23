import assert from "node:assert/strict";
import test from "node:test";

import {
  MONEYSMART_URL,
  NATIONAL_DEBT_HELPLINE,
  guardAiInput,
  guardAskQuestion,
} from "./askGuard";

const refused = [
  "Should I buy this?",
  "What should we do about the car?",
  "Can we afford a holiday?",
  "Which product is best for us?",
  "Should I use Vanguard or Hostplus?",
  "Should I refinance my mortgage?",
  "I am in debt and the credit card is maxed",
  "Which super fund should I pick?",
  "Should I invest in shares?",
  "Is this ETF portfolio a good idea?",
  "Are we okay this month?",
  "is it a good idea to put spare cash in an offset",
  "would it be smart to fix the roof this year",
  "which is better, paying extra or saving",
  "how should I pay off the car loan",
  "can we cope if one income stops",
  "what would you do in our position",
  "hello",
  "list my bills and tell me what I should do",
];

function assertRefused(question: string) {
  const result = guardAskQuestion(question);
  assert.equal(result.allowed, false, question);
  if (result.allowed) return;
  assert.match(result.message, /moneysmart\.gov\.au/i);
  assert.ok(result.message.includes(MONEYSMART_URL));
  assert.ok(result.message.includes(NATIONAL_DEBT_HELPLINE), question);
  assert.match(result.message, /National Debt Helpline/);
  assert.match(result.message, /does not say what you should do/i);
  assert.ok(result.resources.length >= 2);
}

for (const question of refused) {
  test(`refuses: ${question}`, () => {
    assertRefused(question);
  });
}

test("debt questions include the National Debt Helpline", () => {
  const result = guardAskQuestion("Should I consolidate this personal loan?");
  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.ok(result.reasons.includes("debt"));
  assert.ok(result.message.includes(NATIONAL_DEBT_HELPLINE));
  assert.match(result.message, /National Debt Helpline/);
});

test("super and investment questions are refused", () => {
  const superQ = guardAskQuestion("How is my superannuation going?");
  const investQ = guardAskQuestion("List a portfolio recommendation");
  assert.equal(superQ.allowed, false);
  assert.equal(investQ.allowed, false);
  if (!superQ.allowed) assert.ok(superQ.reasons.includes("super"));
  if (!investQ.allowed) assert.ok(investQ.reasons.includes("investment"));
});

test("factual questions about typed figures are allowed", () => {
  const expected: Record<string, string> = {
    "What bills did I enter?": "list",
    "List the income amounts and dates I typed": "list",
    "How much is the rent bill?": "totals",
    "When is the next electricity bill due?": "upcoming_bills",
    "whats the total of the bills i entered": "totals",
    "which bills are due this month": "upcoming_bills",
    "what is the sum by category": "category_sums",
    "what amounts have been entered for goals": "goal_progress",
    "list bills": "list",
    "show upcoming bills": "upcoming_bills",
    "would you list the bills": "list",
    "What bills are entered?": "list",
    "What income amounts are entered?": "list",
    "Which bills are due?": "upcoming_bills",
  };
  for (const [question, intent] of Object.entries(expected)) {
    const result = guardAskQuestion(question);
    assert.equal(result.allowed, true, question);
    if (result.allowed) assert.equal(result.intent, intent, question);
  }
});

test("an empty question is refused", () => {
  assertRefused("  ");
});

test("frame and structure notes are allowed when they do not ask for advice", () => {
  const note = "We're deciding whether to move in June. Factors typed: school, rent, and a review in June.";
  const framed = guardAiInput(note, "frame_decision");
  const structured = guardAiInput("rent 450 fortnightly, electricity 180 monthly", "structure_record");
  assert.equal(framed.allowed, true);
  assert.equal(structured.allowed, true);
});

test("frame and structure notes that ask for advice are refused", () => {
  assert.equal(guardAiInput("should I move house", "frame_decision").allowed, false);
  assert.equal(
    guardAiInput("which is better Hostplus or Vanguard", "structure_record").allowed,
    false
  );
});

test("explain and summarise accept a narrow factual wording", () => {
  assert.equal(guardAiInput("explain the figures I typed", "explain_figures").allowed, true);
  assert.equal(guardAiInput("summarise the bills I entered", "summarise_typed").allowed, true);
  assert.equal(guardAiInput("what would you do", "explain_figures").allowed, false);
  assert.equal(guardAiInput("hello there", "summarise_typed").allowed, false);
});

test("ask job uses the same allowlist", () => {
  assert.equal(guardAiInput("list bills", "ask").allowed, true);
  assert.equal(guardAiInput("what would you do", "ask").allowed, false);
});
