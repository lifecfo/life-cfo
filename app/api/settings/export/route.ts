import { NextResponse } from "next/server";

import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

const TABLES = [
  "profiles",
  "legal_acceptances",
  "beta_access",
  "households",
  "household_members",
  "household_preferences",
  "household_invites",
  "accounts",
  "transactions",
  "external_accounts",
  "external_connections",
  "recurring_bills",
  "recurring_income",
  "money_goals",
  "money_goal_updates",
  "money_goal_accounts",
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
  "home_status_runs",
  "home_status_latest",
  "engine_runs",
] as const;

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const exported: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const table of TABLES) {
    const result = await supabase.from(table).select("*");
    if (result.error) {
      if (!missingTable(result.error)) skipped.push(table);
      continue;
    }
    exported[table] = result.data ?? [];
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      note: "This file contains the rows your account is allowed to read. It is a copy of what was typed, not a recommendation.",
      tables: exported,
      skipped,
    },
    null,
    2
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="life-cfo-data.json"',
      "cache-control": "no-store",
    },
  });
}
