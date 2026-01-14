import { supabase } from "../adapters/supabase";

export async function autoReopenExpiredSnoozes(userId: string) {
  const nowISO = new Date().toISOString();

  const { error } = await supabase
    .from("decision_inbox")
    .update({
      status: "open",
      snoozed_until: null,
    })
    .eq("user_id", userId)
    .eq("status", "snoozed")
    .lte("snoozed_until", nowISO);

  if (error) throw error;
}
