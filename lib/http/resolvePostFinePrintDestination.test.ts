import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePostFinePrintDestination } from "./resolvePostFinePrintDestination";

test("sends a user with no household straight to /household, ignoring nextPath", () => {
  assert.equal(resolvePostFinePrintDestination("/bills", true), "/household");
  assert.equal(resolvePostFinePrintDestination(null, true), "/household");
  assert.equal(resolvePostFinePrintDestination("/household", true), "/household");
});

test("defaults a user who already has a household to Add things", () => {
  assert.equal(resolvePostFinePrintDestination(null, false), "/start");
  assert.equal(resolvePostFinePrintDestination("/home", false), "/start");
});

test("honours an explicit next path when the user already has a household", () => {
  assert.equal(resolvePostFinePrintDestination("/bills", false), "/bills");
});

test("rejects unsafe next paths the same way safeNextPath does", () => {
  assert.equal(resolvePostFinePrintDestination("https://evil.example/steal", false), "/start");
  assert.equal(resolvePostFinePrintDestination("https://evil.example/steal", true), "/household");
});
