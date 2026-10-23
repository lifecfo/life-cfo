export type UsageRow = {
  event_name: string;
  user_id: string | null;
  household_id: string | null;
  created_at: string;
};

export type UsageSummary = {
  signups: number;
  onboarding_completed: number;
  brain_dump_users: number;
  partner_invite_events: number;
  partner_invite_households: number;
  weekly_active_households: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function distinctUsers(rows: UsageRow[], name: string): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.event_name === name && row.user_id) ids.add(row.user_id);
  }
  return ids.size;
}

/** Counts people and households, not raw event rows. */
export function summariseUsage(rows: UsageRow[], now: Date = new Date()): UsageSummary {
  const weekAgo = now.getTime() - WEEK_MS;
  const activeHouseholds = new Set<string>();
  const inviteHouseholds = new Set<string>();
  let partnerInviteEvents = 0;

  for (const row of rows) {
    if (row.event_name === "partner_invite") {
      partnerInviteEvents += 1;
      if (row.household_id) inviteHouseholds.add(row.household_id);
    }
    if (row.event_name !== "household_active" || !row.household_id) continue;
    const at = Date.parse(row.created_at);
    if (!Number.isNaN(at) && at >= weekAgo) activeHouseholds.add(row.household_id);
  }

  return {
    signups: distinctUsers(rows, "signup"),
    onboarding_completed: distinctUsers(rows, "onboarding_completed"),
    brain_dump_users: distinctUsers(rows, "brain_dump_used"),
    partner_invite_events: partnerInviteEvents,
    partner_invite_households: inviteHouseholds.size,
    weekly_active_households: activeHouseholds.size,
  };
}
