import assert from "node:assert/strict";
import test from "node:test";

import { summariseUsage } from "./summariseUsage";

test("usage summary counts distinct people and households", () => {
  const now = new Date("2026-10-23T00:00:00.000Z");
  const summary = summariseUsage(
    [
      { event_name: "signup", user_id: "a", household_id: null, created_at: "2026-10-01T00:00:00.000Z" },
      { event_name: "signup", user_id: "a", household_id: null, created_at: "2026-10-02T00:00:00.000Z" },
      { event_name: "signup", user_id: "b", household_id: null, created_at: "2026-10-02T00:00:00.000Z" },
      { event_name: "onboarding_completed", user_id: "a", household_id: "h1", created_at: "2026-10-02T00:00:00.000Z" },
      { event_name: "brain_dump_used", user_id: "a", household_id: "h1", created_at: "2026-10-02T00:00:00.000Z" },
      { event_name: "brain_dump_used", user_id: "a", household_id: "h1", created_at: "2026-10-03T00:00:00.000Z" },
      { event_name: "partner_invite", user_id: "a", household_id: "h1", created_at: "2026-10-03T00:00:00.000Z" },
      { event_name: "partner_invite", user_id: "a", household_id: "h1", created_at: "2026-10-04T00:00:00.000Z" },
      { event_name: "household_active", user_id: "a", household_id: "h1", created_at: "2026-10-20T00:00:00.000Z" },
      { event_name: "household_active", user_id: "b", household_id: "h1", created_at: "2026-10-21T00:00:00.000Z" },
      { event_name: "household_active", user_id: "c", household_id: "h2", created_at: "2026-10-01T00:00:00.000Z" },
    ],
    now
  );

  assert.equal(summary.signups, 2);
  assert.equal(summary.onboarding_completed, 1);
  assert.equal(summary.brain_dump_users, 1);
  assert.equal(summary.partner_invite_events, 2);
  assert.equal(summary.partner_invite_households, 1);
  assert.equal(summary.weekly_active_households, 1);
});
