import type { SupabaseClient } from "@supabase/supabase-js";
import { getHouseholdMoneyTruth } from "./getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "./buildFinancialSnapshot";
import { explainSnapshot } from "./explainSnapshot";
import { interpretPressure } from "./interpretPressure";

export type HouseholdMoneyReasoningResult = {
  truth: Awaited<ReturnType<typeof getHouseholdMoneyTruth>>;
  snapshot: ReturnType<typeof buildFinancialSnapshot>;
  explanation: ReturnType<typeof explainSnapshot>;
  interpretation: ReturnType<typeof interpretPressure>;
};

export type HouseholdMoneyReasoningTryResult =
  | {
      ok: true;
      data: HouseholdMoneyReasoningResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function runHouseholdMoneyReasoning(
  supabase: SupabaseClient,
  params: { householdId: string }
): Promise<HouseholdMoneyReasoningResult> {
  const truth = await getHouseholdMoneyTruth(supabase, { householdId: params.householdId });
  const snapshot = buildFinancialSnapshot(truth);
  const explanation = explainSnapshot(snapshot);
  const interpretation = interpretPressure(snapshot);

  return {
    truth,
    snapshot,
    explanation,
    interpretation,
  };
}

export async function tryRunHouseholdMoneyReasoning(
  supabase: SupabaseClient,
  params: { householdId: string }
): Promise<HouseholdMoneyReasoningTryResult> {
  try {
    const data = await runHouseholdMoneyReasoning(supabase, params);
    return { ok: true, data };
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Money reasoning unavailable.";
    return { ok: false, error: message };
  }
}

