import assert from "node:assert/strict";
import test from "node:test";

import {
  MONEYSMART_URL,
  NATIONAL_DEBT_HELPLINE,
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
];

for (const question of refused) {
  test(`refuses: ${question}`, () => {
    const result = guardAskQuestion(question);
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.match(result.message, /moneysmart\.gov\.au/i);
    assert.ok(result.message.includes(MONEYSMART_URL));
    assert.match(result.message, /does not say what you should do/i);
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
  for (const question of [
    "What bills did I enter?",
    "List the income amounts and dates I typed",
    "How much is the rent bill?",
    "When is the next electricity bill due?",
  ]) {
    assert.equal(guardAskQuestion(question).allowed, true, question);
  }
});

test("an empty question is not a refusal", () => {
  assert.deepEqual(guardAskQuestion("  "), { allowed: true });
});
