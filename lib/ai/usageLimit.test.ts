import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TOTAL_DAILY_LIMIT_MESSAGE,
  AI_USER_DAILY_LIMIT_MESSAGE,
  AiDailyLimitError,
  capOutputTokens,
  readAiDailyLimits,
  sydneyDay,
  trimAiPrompt,
} from "./usageLimit";

test("daily limits default to 15 per user and 200 for the app", () => {
  assert.deepEqual(readAiDailyLimits({}), { perUser: 15, total: 200 });
  assert.deepEqual(
    readAiDailyLimits({
      LIFE_CFO_AI_DAILY_LIMIT_PER_USER: "8",
      LIFE_CFO_AI_DAILY_LIMIT_TOTAL: "40",
    }),
    { perUser: 8, total: 40 }
  );
  assert.equal(readAiDailyLimits({ LIFE_CFO_AI_DAILY_LIMIT_PER_USER: "0" }).perUser, 15);
});

test("the usage day follows Australia/Sydney", () => {
  assert.equal(sydneyDay(new Date("2026-10-23T12:30:00Z")), "2026-10-23");
  assert.equal(sydneyDay(new Date("2026-10-23T13:30:00Z")), "2026-10-24");
});

test("output tokens stay modest and long prompts are trimmed", () => {
  assert.equal(capOutputTokens(2000), AI_MAX_OUTPUT_TOKENS);
  assert.equal(capOutputTokens(400), 400);
  assert.equal(trimAiPrompt("a".repeat(9000)).length, 8000);
});

test("limit errors use the beta messages", () => {
  assert.equal(new AiDailyLimitError("user").message, AI_USER_DAILY_LIMIT_MESSAGE);
  assert.equal(new AiDailyLimitError("total").message, AI_TOTAL_DAILY_LIMIT_MESSAGE);
});
