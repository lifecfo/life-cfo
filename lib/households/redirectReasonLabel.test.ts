import { test } from "node:test";
import assert from "node:assert/strict";
import { redirectReasonLabel } from "./redirectReasonLabel";

test("maps known tab paths to short labels", () => {
  assert.equal(redirectReasonLabel("/bills"), "Bills");
  assert.equal(redirectReasonLabel("/bills/123"), "Bills");
  assert.equal(redirectReasonLabel("/money/goals"), "Goals");
  assert.equal(redirectReasonLabel("/money/out"), "Money out");
  assert.equal(redirectReasonLabel("/decisions"), "Decision notes");
});

test("treats /home and /lifecfo-home as the same destination", () => {
  assert.equal(redirectReasonLabel("/home"), "Home");
  assert.equal(redirectReasonLabel("/lifecfo-home"), "Home");
});

test("falls back to a generic label for unknown paths", () => {
  assert.equal(redirectReasonLabel("/some-future-page"), "this page");
  assert.equal(redirectReasonLabel("/"), "this page");
});
