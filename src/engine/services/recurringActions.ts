import { supabase } from "../adapters/supabase";

// Helper: turn "YYYY-MM-DD" into day-of-month string like "30"
function dayOfMonthFromISO(dateISO: string): string {
  // dateISO expected: YYYY-MM-DD
  const day = dateISO.slice(8, 10); // "01".."31"
  // remove leading zero ("01" -> "1")
  return String(parseInt(day, 10));
}

export async function confirmRecurring(userId: string, merchantKey: string) {
  // 1) Load the stored pattern so we can use next_due_date + avg_amount
  const { data: patRow, error: patReadErr } = await supabase
    .from("recurring_patterns")
    .select("merchant_key,status,next_due_date,avg_amount,cadence")
    .eq("user_id", userId)
    .eq("merchant_key", merchantKey)
    .single();

  if (patReadErr) throw patReadErr;

  const nextDue = patRow?.next_due_date as string | null;
  const avgAmount = (patRow?.avg_amount as number | null) ?? null;

  // Best effort due_day_or_date:
  // - if we have a next_due_date like "2026-01-30" => store "30"
  // - fallback to "1" if missing
  const due_day_or_date = nextDue ? dayOfMonthFromISO(nextDue) : "1";

  // 2) Mark pattern confirmed
  const { error: patUpdateErr } = await supabase
    .from("recurring_patterns")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      ignored_at: null,
    })
    .eq("user_id", userId)
    .eq("merchant_key", merchantKey);

  if (patUpdateErr) throw patUpdateErr;

  // 3) Promote to bill (upsert)
  const { error: billErr } = await supabase
    .from("bills")
    .upsert(
      {
        user_id: userId,
        merchant_key: merchantKey,
        nickname: merchantKey,
        due_day_or_date,
        expected_amount: avgAmount,
        status: "active",
      },
      { onConflict: "user_id,merchant_key" }
    );

  if (billErr) throw billErr;
}

export async function ignoreRecurring(userId: string, merchantKey: string) {
  const { error } = await supabase
    .from("recurring_patterns")
    .update({
      status: "ignored",
      ignored_at: new Date().toISOString(),
      confirmed_at: null,
    })
    .eq("user_id", userId)
    .eq("merchant_key", merchantKey);

  if (error) throw error;
}
