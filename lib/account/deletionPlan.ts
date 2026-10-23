export type DeletionMembership = {
  household_id: string;
  household_name: string;
  role: string;
  member_count: number;
  owner_count: number;
  active_bank_connections: number;
  active_lifecycle_jobs: number;
};

export type DeletionBlocker = {
  code: "sole_household_owner" | "active_bank_connections" | "active_lifecycle_jobs";
  household_id: string;
  message: string;
  action_label: string;
  href: string;
};

export function deletionBlockers(memberships: DeletionMembership[]): DeletionBlocker[] {
  const blockers: DeletionBlocker[] = [];
  for (const membership of memberships) {
    const soleOwnerOfOthers =
      membership.role === "owner" &&
      membership.owner_count <= 1 &&
      membership.member_count > 1;
    if (soleOwnerOfOthers) {
      blockers.push({
        code: "sole_household_owner",
        household_id: membership.household_id,
        message: `You are the only owner of ${membership.household_name}, and other people are still in it. Add another owner, or remove the other members, before deleting your account.`,
        action_label: "Open household",
        href: "/household",
      });
    }
    if (membership.active_bank_connections > 0) {
      blockers.push({
        code: "active_bank_connections",
        household_id: membership.household_id,
        message: "A bank connection is still on this household. It has to be cleared before the account can be deleted.",
        action_label: "Email admin@life-cfo.com",
        href: "mailto:admin@life-cfo.com",
      });
    }
    if (membership.active_lifecycle_jobs > 0) {
      blockers.push({
        code: "active_lifecycle_jobs",
        household_id: membership.household_id,
        message: "A bank connection change is still in progress.",
        action_label: "Email admin@life-cfo.com",
        href: "mailto:admin@life-cfo.com",
      });
    }
  }
  return blockers;
}

export function soleMemberHouseholdIds(memberships: DeletionMembership[]): string[] {
  return memberships
    .filter((membership) => membership.member_count <= 1)
    .map((membership) => membership.household_id);
}
