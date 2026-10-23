import assert from "node:assert/strict";
import test from "node:test";

import { DECISION_PACK_NOTE, buildDecisionPack, recordedFactorsAndQuestions } from "./decisionPack";

test("a decision pack restates typed items that share words and makes no recommendation", () => {
  const pack = buildDecisionPack({
    title: "School fees",
    statement: "The school fees invoice arrived.",
    factors: ["The invoice date was typed as March."],
    questions: ["Who has the paper copy?"],
    review_on: "2026-11-01",
    items: [
      { title: "School fees", kind: "bill", amount_cents: 120000, currency: "AUD", due_on: "2026-11-01" },
      { title: "Electricity", kind: "bill", amount_cents: 18000, currency: "AUD", due_on: null },
    ],
  });
  assert.equal(pack.note, DECISION_PACK_NOTE);
  assert.match(pack.note, /no recommendation/i);
  assert.equal(pack.matched_items.length, 1);
  assert.equal(pack.matched_items[0].title, "School fees");
  assert.deepEqual(pack.factors, ["The invoice date was typed as March."]);
});

test("factor and question lines are read from what was typed", () => {
  const recorded = recordedFactorsAndQuestions([
    "Factor: The invoice date was typed as March.\nQuestion: Who has the paper copy?\nThe envelope is on the fridge.",
  ]);
  assert.deepEqual(recorded.factors, ["The invoice date was typed as March."]);
  assert.deepEqual(recorded.questions, ["Who has the paper copy?"]);
  assert.deepEqual(recorded.other_notes, ["The envelope is on the fridge."]);
});
