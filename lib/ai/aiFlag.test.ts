import assert from "node:assert/strict";
import test from "node:test";

import { isAiEnabled } from "./aiFlag";

test("the AI server flag is on only for the exact string true", () => {
  const previous = process.env.LIFE_CFO_AI_ENABLED;
  try {
    process.env.LIFE_CFO_AI_ENABLED = "true";
    assert.equal(isAiEnabled(), true);
    process.env.LIFE_CFO_AI_ENABLED = "1";
    assert.equal(isAiEnabled(), false);
    process.env.LIFE_CFO_AI_ENABLED = "TRUE";
    assert.equal(isAiEnabled(), false);
    delete process.env.LIFE_CFO_AI_ENABLED;
    assert.equal(isAiEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.LIFE_CFO_AI_ENABLED;
    else process.env.LIFE_CFO_AI_ENABLED = previous;
  }
});
