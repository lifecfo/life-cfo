import assert from "node:assert/strict";
import test from "node:test";

import { MASCOT_LINES } from "./lines";
import { screenAiOutput } from "@/lib/ai/outputGuard";

// The exact banned-word list from docs/product/ai-boundaries.md's
// 5-question test (question 2). Checked independently of screenAiOutput's
// narrowed, false-positive-aware patterns, so a future mascot line can't
// slip past either check.
const BANNED_WORDS = [
  "should",
  "ought",
  "recommend",
  "suggest",
  "better",
  "best",
  "worth it",
  "smart",
  "afford",
  "affordable",
  "suitable",
  "safe to spend",
  "enough",
  "too much",
  "on track",
  "ideally",
];

test("mascot lines: the set is exactly the closed list of 10", () => {
  assert.equal(MASCOT_LINES.length, 10);
});

for (const line of MASCOT_LINES) {
  test(`mascot line passes the AI output guard: "${line}"`, () => {
    const screened = screenAiOutput(line);
    assert.equal(screened.ok, true, `"${line}" was blocked: ${screened.ok ? "" : screened.patterns.join(", ")}`);
  });

  test(`mascot line contains no banned word from ai-boundaries.md: "${line}"`, () => {
    const lower = line.toLowerCase();
    const hits = BANNED_WORDS.filter((word) => lower.includes(word));
    assert.deepEqual(hits, [], `"${line}" contains banned word(s): ${hits.join(", ")}`);
  });
}
