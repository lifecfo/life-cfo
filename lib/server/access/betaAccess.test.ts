import assert from "node:assert/strict";
import test from "node:test";

import { inviteCodeMatches } from "./betaAccess";

test("invite codes match only the configured value", () => {
  const previous = process.env.LIFE_CFO_BETA_INVITE_CODES;
  process.env.LIFE_CFO_BETA_INVITE_CODES = "harbour-pine, second-code";
  try {
    assert.equal(inviteCodeMatches("harbour-pine"), true);
    assert.equal(inviteCodeMatches("second-code"), true);
    assert.equal(inviteCodeMatches("harbour-pine "), true);
    assert.equal(inviteCodeMatches("Harbour-pine"), false);
    assert.equal(inviteCodeMatches("nope"), false);
    assert.equal(inviteCodeMatches(""), false);
  } finally {
    if (previous === undefined) delete process.env.LIFE_CFO_BETA_INVITE_CODES;
    else process.env.LIFE_CFO_BETA_INVITE_CODES = previous;
  }
});

test("invite matching fails closed when no codes are configured", () => {
  const previous = process.env.LIFE_CFO_BETA_INVITE_CODES;
  delete process.env.LIFE_CFO_BETA_INVITE_CODES;
  try {
    assert.equal(inviteCodeMatches("harbour-pine"), false);
  } finally {
    if (previous === undefined) delete process.env.LIFE_CFO_BETA_INVITE_CODES;
    else process.env.LIFE_CFO_BETA_INVITE_CODES = previous;
  }
});
