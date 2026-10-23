import assert from "node:assert/strict";
import test from "node:test";

import { AI_OUTPUT_REFUSAL, logBlockedOutput, redactFigures, screenAiOutput } from "./outputGuard";
import { MONEYSMART_URL, NATIONAL_DEBT_HELPLINE } from "@/lib/ask/askGuard";

test("post-check blocks advice patterns and product names", () => {
  const samples = [
    "You should switch to Hostplus.",
    "I recommend the offset.",
    "It is better to wait.",
    "I'd suggest paying extra.",
    "You can afford this holiday.",
    "Consider switching to Vanguard.",
    "The rent bill entered is $1,250 a month.",
  ];
  for (const sample of samples.slice(0, 6)) {
    const screened = screenAiOutput(sample);
    assert.equal(screened.ok, false, sample);
    if (screened.ok) continue;
    assert.ok(screened.patterns.length > 0, sample);
    assert.equal(screened.replacement, AI_OUTPUT_REFUSAL);
    assert.ok(screened.replacement.includes(MONEYSMART_URL));
    assert.ok(screened.replacement.includes(NATIONAL_DEBT_HELPLINE));
  }
  assert.equal(screenAiOutput(samples[6]).ok, true);
});

test("structuring a typed insurance item is not treated as insurance guidance", () => {
  const extracted = '{"title":"car insurance renewal","kind":"renewal","amount_cents":32000}';
  assert.equal(screenAiOutput(extracted).ok, false);
  assert.equal(screenAiOutput(extracted, { purpose: "structure_record" }).ok, true);
  assert.equal(screenAiOutput("You should renew the insurance.", { purpose: "structure_record" }).ok, false);
});

test("post-check redacts figures before a blocked answer is logged", () => {
  const raw = "You should move the $4,500 balance to Stake.";
  const screened = screenAiOutput(raw);
  assert.equal(screened.ok, false);
  if (screened.ok) return;
  assert.equal(screened.redacted.includes("4500"), false);
  assert.equal(screened.redacted.includes("4,500"), false);
  assert.equal(screened.redacted.includes("$"), false);
  assert.match(screened.redacted, /\[n\]/);
  assert.equal(redactFigures("Balance 4500").includes("4500"), false);

  const lines: string[] = [];
  const original = console.info;
  console.info = (message?: unknown) => {
    lines.push(String(message));
  };
  try {
    logBlockedOutput("home_ask", { patterns: screened.patterns, redacted: screened.redacted });
  } finally {
    console.info = original;
  }
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("4500"), false);
  assert.equal(lines[0].includes("$"), false);
  assert.match(lines[0], /ai_output_blocked/);
  assert.equal(lines[0].includes(raw), false);
});
