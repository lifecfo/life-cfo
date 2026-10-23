import assert from "node:assert/strict";
import test from "node:test";

import { AU_LOCALE_WARNING, australiaSoftWarning, birthYearIsAdult } from "./suitability";

const now = new Date("2026-10-23T00:00:00.000Z");

test("birth year is an adult check and rejects under 18 or implausible years", () => {
  assert.equal(birthYearIsAdult(2008, now), true);
  assert.equal(birthYearIsAdult(2009, now), false);
  assert.equal(birthYearIsAdult(1890, now), false);
  assert.equal(birthYearIsAdult(2020, now), false);
  assert.equal(birthYearIsAdult(1990.5, now), false);
});

test("timezone or locale that looks Australian skips the warning", () => {
  assert.equal(australiaSoftWarning("Australia/Hobart", "en-US"), null);
  assert.equal(australiaSoftWarning("Europe/London", "en-AU"), null);
  assert.equal(australiaSoftWarning("Australia/Sydney", "en-AU"), null);
});

test("a non-Australian timezone and locale shows a warning and does not block by itself", () => {
  assert.equal(australiaSoftWarning("Europe/London", "en-GB"), AU_LOCALE_WARNING);
  assert.equal(australiaSoftWarning("", ""), AU_LOCALE_WARNING);
});
