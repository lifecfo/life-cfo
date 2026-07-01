import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipRow = {
  household_id: string;
  role: string | null;
  households: unknown;
};

type HouseholdMemberCountRow = {
  household_id: string;
  role: string | null;
};

type ConnectionCountRow = {
  household_id: string;
  provider: string | null;
  status: string | null;
  metadata: unknown;
};

type LifecycleJobCountRow = {
  household_id: string;
  status: string | null;
};

type DeleteBlocker = {
  code:
    | "sole_household_owner"
    | "shared_household"
    | "active_bank_connections"
    | "support_managed_connections"
    | "active_lifecycle_jobs";
  household_id: string;
  message: string;
  action_label: string;
  href: string;
};

const ACTIVE_BANK_STATUSES = new Set([
  "active",
  "needs_auth",
  "error",
  "disconnecting",
  "disconnect_failed",
  "support_required",
]);

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function householdName(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "Household";
  const name = (row as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : "Household";
}

function countByHousehold<T extends { household_id: string }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.household_id, (counts.get(row.household_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Please sign in again." },
        { status: 401 }
      );
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id,role,households(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (membershipError) throw membershipError;

    const membershipRows = (membershipData ?? []) as MembershipRow[];
    const householdIds = membershipRows.map((row) => row.household_id);

    let householdMemberRows: HouseholdMemberCountRow[] = [];
    let connectionRows: ConnectionCountRow[] = [];
    let lifecycleJobRows: LifecycleJobCountRow[] = [];

    if (householdIds.length > 0) {
      const admin = supabaseAdmin();
      const [membersResult, connectionsResult, lifecycleJobsResult] = await Promise.all([
        admin
          .from("household_members")
          .select("household_id,role")
          .in("household_id", householdIds),
        admin
          .from("external_connections")
          .select("household_id,provider,status,metadata")
          .in("household_id", householdIds),
        admin
          .from("source_lifecycle_jobs")
          .select("household_id,status")
          .in("household_id", householdIds)
          .in("status", ["queued", "processing"]),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (connectionsResult.error) throw connectionsResult.error;
      if (lifecycleJobsResult.error) throw lifecycleJobsResult.error;

      householdMemberRows = (membersResult.data ?? []) as HouseholdMemberCountRow[];
      connectionRows = (connectionsResult.data ?? []) as ConnectionCountRow[];
      lifecycleJobRows = (lifecycleJobsResult.data ?? []) as LifecycleJobCountRow[];
    }

    const memberCounts = countByHousehold(householdMemberRows);
    const ownerCounts = countByHousehold(
      householdMemberRows.filter((row) => normalize(row.role) === "owner")
    );
    const activeBankRows = connectionRows.filter((row) => {
      const provider = normalize(row.provider);
      return (
        (provider === "plaid" || provider === "basiq") &&
        ACTIVE_BANK_STATUSES.has(normalize(row.status))
      );
    });
    const supportManagedRows = activeBankRows.filter(
      (row) => normalize(row.provider) === "basiq"
    );
    const uploadedBankFileRows = connectionRows.filter((row) => {
      const metadata = metadataRecord(row.metadata);
      return (
        normalize(row.provider) === "manual" &&
        metadata.manual_csv === true &&
        metadata.source_type === "csv_upload"
      );
    });
    const activeBankCounts = countByHousehold(activeBankRows);
    const supportManagedCounts = countByHousehold(supportManagedRows);
    const activeLifecycleJobCounts = countByHousehold(lifecycleJobRows);

    const memberships = membershipRows.map((row) => {
      const memberCount = memberCounts.get(row.household_id) ?? 0;
      const ownerCount = ownerCounts.get(row.household_id) ?? 0;
      const role = normalize(row.role) || "viewer";
      return {
        household_id: row.household_id,
        household_name: householdName(row.households),
        role,
        member_count: memberCount,
        owner_count: ownerCount,
        sole_owner: role === "owner" && ownerCount === 1,
        shared_household: memberCount > 1,
      };
    });

    const blockers: DeleteBlocker[] = [];
    for (const membership of memberships) {
      if (membership.sole_owner) {
        blockers.push({
          code: "sole_household_owner",
          household_id: membership.household_id,
          message:
            "You’re the only owner of this household. Add another owner before deleting your account.",
          action_label: "Manage owners",
          href: "/household",
        });
      }
      if (membership.shared_household) {
        blockers.push({
          code: "shared_household",
          household_id: membership.household_id,
          message:
            "This household has other members. Shared household information may stay for them.",
          action_label: "Open household",
          href: "/household",
        });
      }

      const activeBankCount = activeBankCounts.get(membership.household_id) ?? 0;
      const supportManagedCount =
        supportManagedCounts.get(membership.household_id) ?? 0;
      if (supportManagedCount > 0) {
        blockers.push({
          code: "support_managed_connections",
          household_id: membership.household_id,
          message: "Some bank connections need support during private beta.",
          action_label: "Contact support",
          href: "mailto:admin@life-cfo.com",
        });
      }
      if (activeBankCount > supportManagedCount) {
        blockers.push({
          code: "active_bank_connections",
          household_id: membership.household_id,
          message: "Bank connections need to be handled before deleting this household.",
          action_label: "Open connections",
          href: "/connections",
        });
      }
      if ((activeLifecycleJobCounts.get(membership.household_id) ?? 0) > 0) {
        blockers.push({
          code: "active_lifecycle_jobs",
          household_id: membership.household_id,
          message: "A bank connection change is still in progress.",
          action_label: "Open connections",
          href: "/connections",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      self_service_allowed: false,
      memberships,
      sources: {
        active_bank_connections: activeBankRows.length,
        support_managed_connections: supportManagedRows.length,
        uploaded_bank_file_sources: uploadedBankFileRows.length,
        active_lifecycle_jobs: lifecycleJobRows.length,
      },
      blockers,
      next_steps: [],
      message: "Account deletion is handled with support during private beta.",
    });
  } catch (error: unknown) {
    console.error("delete_account_preflight_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t check this yet. Please try again." },
      { status: 500 }
    );
  }
}
