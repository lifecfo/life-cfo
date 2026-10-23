import { NextResponse } from "next/server";

import { deletionBlockers, soleMemberHouseholdIds, type DeletionMembership } from "@/lib/account/deletionPlan";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

const USER_TABLES = [
  "decision_inbox",
  "engine_runs",
  "home_status_runs",
  "home_status_latest",
  "decisions",
  "decision_summaries",
  "money_goal_updates",
  "money_goal_accounts",
  "money_goals",
  "money_buckets",
  "money_bucket_allocations",
  "transaction_pattern_confirmations",
  "liabilities",
  "investment_accounts",
  "family_members",
  "pets",
  "household_invites",
  "legal_acceptances",
  "beta_access",
  "profiles",
];

const HOUSEHOLD_TABLES = [
  "transactions",
  "accounts",
  "external_accounts",
  "external_connections",
  "recurring_bills",
  "recurring_income",
  "money_goal_updates",
  "money_goal_accounts",
  "money_goals",
  "money_buckets",
  "money_bucket_allocations",
  "family_members",
  "pets",
  "decisions",
  "decision_summaries",
  "decision_inbox",
  "transaction_pattern_confirmations",
  "liabilities",
  "investment_accounts",
  "household_preferences",
  "household_invites",
  "household_members",
  "home_status_runs",
  "engine_runs",
];

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("column")
  );
}

async function deleteWhere(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  column: "user_id" | "household_id",
  value: string
) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && !missingRelation(error)) {
    throw new Error(error.message || `Couldn't delete ${table}.`);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { ok: false, error: "Type DELETE to confirm account deletion." },
        { status: 400 }
      );
    }

    const preflight = await fetch(new URL("/api/settings/delete/preflight", req.url), {
      headers: { cookie: req.headers.get("cookie") || "" },
    });
    const plan = (await preflight.json().catch(() => null)) as {
      ok?: boolean;
      self_service_allowed?: boolean;
      blockers?: unknown[];
      memberships?: DeletionMembership[];
    } | null;
    if (!preflight.ok || !plan?.ok) {
      return NextResponse.json({ ok: false, error: "Life CFO couldn't check this account yet." }, { status: 503 });
    }
    if (!plan.self_service_allowed) {
      return NextResponse.json(
        { ok: false, error: "This account can't be deleted until the remaining items are cleared.", blockers: plan.blockers ?? [] },
        { status: 409 }
      );
    }

    const admin = supabaseAdmin();
    const memberships = Array.isArray(plan.memberships) ? plan.memberships : [];
    if (deletionBlockers(memberships).length > 0) {
      return NextResponse.json({ ok: false, error: "This account can't be deleted yet." }, { status: 409 });
    }

    for (const householdId of soleMemberHouseholdIds(memberships)) {
      for (const table of HOUSEHOLD_TABLES) {
        await deleteWhere(admin, table, "household_id", householdId);
      }
      await deleteWhere(admin, "households", "household_id", householdId);
      const { error: householdError } = await admin.from("households").delete().eq("id", householdId);
      if (householdError && !missingRelation(householdError)) {
        throw new Error(householdError.message);
      }
    }

    const { error: membershipError } = await admin.from("household_members").delete().eq("user_id", user.id);
    if (membershipError && !missingRelation(membershipError)) {
      throw new Error(membershipError.message);
    }

    for (const table of USER_TABLES) {
      await deleteWhere(admin, table, "user_id", user.id);
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Household data was removed, but the sign-in account could not be deleted. Email admin@life-cfo.com.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
      kept_shared_households: memberships.filter((membership) => membership.member_count > 1).map((membership) => membership.household_id),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Please try again." },
      { status: 500 }
    );
  }
}
