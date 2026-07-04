import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { deriveCashPlan } from "@/lib/money/reasoning/deriveCashPlan";
import { deriveEffectiveMoneyTruth } from "@/lib/money/reasoning/effectiveMoneySources";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import type {
  AccountsTruthRow,
  MoneyBucketAllocationTruthRow,
  MoneyBucketTruthRow,
} from "@/lib/money/reasoning/types";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const rawTruth = await getHouseholdMoneyTruth(supabase, { householdId });
    const { truth: effectiveTruth } = deriveEffectiveMoneyTruth(rawTruth);
    const [bucketsResult, allocationsResult, archivedAccountsResult] =
      await Promise.all([
        supabase
          .from("money_buckets")
          .select(
            "id,household_id,name,purpose_type,currency,target_amount_cents,target_date,priority,status"
          )
          .eq("household_id", householdId)
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("money_bucket_allocations")
          .select(
            "id,household_id,bucket_id,account_id,allocation_type,amount_cents"
          )
          .eq("household_id", householdId)
          .order("created_at", { ascending: true }),
        supabase
          .from("accounts")
          .select(
            "id,household_id,connection_id,name,provider,type,subtype,status,archived,current_balance_cents,available_balance_cents,currency,updated_at,created_at"
          )
          .eq("household_id", householdId)
          .eq("archived", true),
      ]);

    if (bucketsResult.error || allocationsResult.error || archivedAccountsResult.error) {
      return NextResponse.json(
        { ok: false, error: "Life CFO couldn’t load the Cash Plan yet." },
        { status: 500 }
      );
    }

    const knownAccounts = new Map<string, AccountsTruthRow>();
    for (const account of [
      ...rawTruth.accounts,
      ...((archivedAccountsResult.data ?? []) as AccountsTruthRow[]),
    ]) {
      knownAccounts.set(account.id, account);
    }

    const cashPlan = deriveCashPlan({
      householdId,
      effectiveAccounts: effectiveTruth.accounts,
      knownAccounts: [...knownAccounts.values()],
      buckets: (bucketsResult.data ?? []) as MoneyBucketTruthRow[],
      allocations: (allocationsResult.data ?? []) as MoneyBucketAllocationTruthRow[],
    });

    return NextResponse.json({ ok: true, cash_plan: cashPlan });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t load the Cash Plan yet." },
      { status: 500 }
    );
  }
}
