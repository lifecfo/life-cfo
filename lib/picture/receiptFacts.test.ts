import assert from "node:assert/strict";
import test from "node:test";

import {
  categoriesSafeForReceiptRead,
  confirmedItemsWithReceipts,
  draftFromReceiptFacts,
  receiptReadPrompt,
  sanitiseReceiptFacts,
} from "./receiptFacts";

const CATEGORIES = ["Groceries", "Transport", "Bills"];

test("receipt facts keep printed fields and an existing category only", () => {
  const facts = sanitiseReceiptFacts(
    {
      merchant: "  Corner Shop  ",
      date: "2026-10-01",
      total_cents: 1250,
      gst_cents: 114,
      due_on: "2026-10-15",
      line_items: [{ description: "Milk", amount_cents: 250 }],
      category: "groceries",
    },
    CATEGORIES
  );
  assert.ok(facts);
  assert.equal(facts?.merchant, "Corner Shop");
  assert.equal(facts?.category, "Groceries");
  assert.equal(facts?.gst_cents, 114);
  const draft = draftFromReceiptFacts(facts!);
  assert.equal(draft.title, "Corner Shop");
  assert.equal(draft.kind, "bill");
  assert.equal(draft.amount_cents, 1250);
  assert.equal(draft.due_on, "2026-10-15");
  assert.match(draft.notes ?? "", /Receipt date: 2026-10-01/);
  assert.match(draft.notes ?? "", /GST: \$1\.14/);
  assert.match(draft.notes ?? "", /Category: Groceries/);
  assert.match(draft.notes ?? "", /Milk \$2\.50/);
});

test("an invented category and a gst figure above the total are dropped", () => {
  const facts = sanitiseReceiptFacts(
    {
      merchant: "Power Co",
      date: null,
      total_cents: 1000,
      gst_cents: 5000,
      due_on: "2026-02-31",
      line_items: [],
      category: "Investments",
    },
    CATEGORIES
  );
  assert.equal(facts?.category, null);
  assert.equal(facts?.gst_cents, null);
  assert.equal(facts?.due_on, null);
});

test("unusable reading returns null and category names that ask for advice are left out", () => {
  assert.equal(sanitiseReceiptFacts({ merchant: "Shop" }, CATEGORIES), null);
  assert.deepEqual(categoriesSafeForReceiptRead(["Groceries", "You should switch", "Bills"]), ["Groceries", "Bills"]);
  const prompt = receiptReadPrompt(["Groceries", "You should switch"]);
  assert.match(prompt, /Groceries/);
  assert.equal(prompt.includes("should"), false);
});

test("confirmed rows keep a receipt id beside each titled item", () => {
  const rows = confirmedItemsWithReceipts([
    {
      title: "Power",
      kind: "bill",
      amount_cents: 8000,
      due_on: "2026-11-01",
      notes: null,
      receipt_id: "11111111-1111-4111-8111-111111111111",
    },
    { title: "   ", kind: "note", amount_cents: null, due_on: null, notes: null, receipt_id: "nope" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.item.title, "Power");
  assert.equal(rows[0]?.receiptId, "11111111-1111-4111-8111-111111111111");
});
