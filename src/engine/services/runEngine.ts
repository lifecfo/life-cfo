// src/engine/services/runEngine.ts
import { supabase } from "../adapters/supabase";
import { Bill, Transaction, RecurringPattern } from "../domain/types";
import { detectRecurringPatterns } from "../domain/recurring";
import { forecastCashflow30d } from "../domain/forecast";
import { generateInsights } from "../domain/insights";
import { autoReopenExpiredSnoozes } from "./autoReopenSnoozed";

export async function runEngine(
  userId: string,
  startBalance = 0,
  startDateISO?: string
) {
  // Auto-reopen any snoozes that have expired
  await autoReopenExpiredSnoozes(userId);

  // 1) Load data
  const { data: bills, error: billsErr } = await supabase
    .from("bills")
    .select("*")
    .eq("user_id", userId);

  if (billsErr) throw billsErr;

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (txErr) throw txErr;

  const typedBills = (bills ?? []) as Bill[];
  const typedTxs = (txs ?? []) as Transaction[];

  // 2) Domain logic
  const patterns = detectRecurringPatterns(typedTxs, userId);

  // 2.1) Persist detected recurring patterns (upsert)
  if (patterns.length > 0) {
    const { error: patErr } = await supabase
      .from("recurring_patterns")
      .upsert(
        patterns.map((p) => ({
          user_id: p.user_id,
          merchant_key: p.merchant_key,
          cadence: p.cadence,
          avg_amount: p.avg_amount ?? null,
          next_due_date: p.next_due_date ?? null,
          confidence: p.confidence,
        })),
        { onConflict: "user_id,merchant_key" }
      );

    if (patErr) throw patErr;
  }

  // 2.2) Load stored recurring_patterns so we can respect status (confirmed/ignored)
  const { data: storedPatterns, error: storedErr } = await supabase
    .from("recurring_patterns")
    .select("merchant_key,status,confirmed_at,ignored_at")
    .eq("user_id", userId);

  if (storedErr) throw storedErr;

  const storedByMerchant = new Map(
    (storedPatterns ?? []).map((p: any) => [p.merchant_key as string, p])
  );

  // 2.3) Merge stored status fields onto detected patterns (for insights + output)
  const patternsWithStatus: Array<Omit<RecurringPattern, "id" | "created_at">> = patterns.map((p) => {
  const stored = storedByMerchant.get(p.merchant_key) as any;

  const status: RecurringPattern["status"] =
    stored?.status === "confirmed" || stored?.status === "ignored" || stored?.status === "pending"
      ? stored.status
      : "pending";

  return {
    ...p,
    status,
    confirmed_at: (stored?.confirmed_at as string | null) ?? null,
    ignored_at: (stored?.ignored_at as string | null) ?? null,
  };
});


  const forecast = forecastCashflow30d({
    startBalance,
    bills: typedBills,
    startDateISO,
  });

  const insights = generateInsights({
    forecast,
    bills: typedBills,
    patterns: patternsWithStatus,
  });

  // 3) Write engine run record
  const version = "engine-v1";
  const { data: runRow, error: runErr } = await supabase
    .from("engine_runs")
    .insert([{ user_id: userId, version, status: "success" }])
    .select("*")
    .single();

  if (runErr) throw runErr;

  const runId = runRow.id as string;

  // 4) Write insights
  const insightRows = insights.map((i) => ({
    user_id: userId,
    run_id: runId,
    type: i.type,
    severity: i.severity ?? 1,
    payload_json: i.payload,
  }));

  const { error: insErr } = await supabase.from("engine_insights").insert(insightRows);
  if (insErr) throw insErr;

  // 5) Decision Inbox (deduped)
  const inboxItems: Array<{
    user_id: string;
    run_id: string;
    dedupe_key: string;
    type: string;
    title: string;
    body?: string | null;
    severity?: number | null;
  }> = [];

  for (const ins of insights) {
    if (ins.type === "upcoming_bills") {
      const payload = ins.payload as any;
      const items = (payload.items ?? []) as Array<any>;
      const lines = items
        .map((b) => `• ${b.merchant_key} — $${b.amount} on ${b.date}`)
        .join("\n");

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: "upcoming_bills",
        type: "upcoming_bills",
        title: `Upcoming bills (${payload.count ?? items.length})`,
        body: lines || "No upcoming bills found.",
        severity: ins.severity ?? 1,
      });
    }

    if (ins.type === "safe_to_spend_week") {
      const payload = ins.payload as any;

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: "safe_to_spend_week",
        type: "safe_to_spend_week",
        title: "Safe to spend this week",
        body: `Estimated safe-to-spend: $${payload.amount}`,
        severity: ins.severity ?? 1,
      });
    }

    if (ins.type === "next_action") {
      const payload = ins.payload as any;
      const action = payload.action ?? "unknown";

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: `next_action:${action}`,
        type: "next_action",
        title: "Next action",
        body: payload.message ?? "",
        severity: ins.severity ?? 2,
      });
    }
  }

    // ---- decision inbox: respect done + snoozed (do not overwrite them) ----

  // inboxItems MUST include dedupe_key for this to work
  const now = new Date();
  const nowISO = now.toISOString();

  const dedupeKeys = Array.from(
    new Set(
      inboxItems
        .map((x: any) => x.dedupe_key)
        .filter((k: any) => typeof k === "string" && k.length > 0)
    )
  );

  let inboxItemsToUpsert = inboxItems;

  if (dedupeKeys.length > 0) {
    const { data: existing, error: existingErr } = await supabase
      .from("decision_inbox")
      .select("dedupe_key,status,snoozed_until")
      .eq("user_id", userId)
      .in("dedupe_key", dedupeKeys);

    if (existingErr) throw existingErr;

    const existingByKey = new Map<string, any>(
      (existing ?? []).map((r: any) => [r.dedupe_key, r])
    );

    inboxItemsToUpsert = inboxItems.filter((item: any) => {
      const current = existingByKey.get(item.dedupe_key);

      // If no existing row, allow insert/upsert
      if (!current) return true;

      // If done, never touch it
      if (current.status === "done") return false;

      // If snoozed into the future, don't touch it
      if (current.status === "snoozed" && current.snoozed_until) {
        const snoozeUntil = new Date(current.snoozed_until).toISOString();
        if (snoozeUntil > nowISO) return false;
      }

      // Otherwise, ok to upsert (open or snooze expired)
      return true;
    });
  }

  console.log("decision_inbox items to upsert =", inboxItemsToUpsert.length);

  if (inboxItemsToUpsert.length > 0) {
    const { error: inboxErr } = await supabase
      .from("decision_inbox")
      .upsert(inboxItemsToUpsert, { onConflict: "user_id,dedupe_key" });

    if (inboxErr) throw inboxErr;
  }

  // 6) Return result for runner
  return {
    runId,
    version,
    forecast,
    patterns: patternsWithStatus,
    insights,
  };
}
