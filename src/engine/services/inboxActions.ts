import { supabase } from "../adapters/supabase";

export type InboxStatus = "open" | "done" | "snoozed";

export async function markInboxItemDone(userId: string, inboxId: string) {
  const { error } = await supabase
    .from("decision_inbox")
    .update({
      status: "done",
      snoozed_until: null,
    })
    .eq("id", inboxId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function snoozeInboxItem(userId: string, inboxId: string, untilISO: string) {
  const { error } = await supabase
    .from("decision_inbox")
    .update({
      status: "snoozed",
      snoozed_until: untilISO,
    })
    .eq("id", inboxId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function reopenInboxItem(userId: string, inboxId: string) {
  const { error } = await supabase
    .from("decision_inbox")
    .update({
      status: "open",
      snoozed_until: null,
    })
    .eq("id", inboxId)
    .eq("user_id", userId);

  if (error) throw error;
}

// “What should I show the user right now?”
export async function listInboxVisible(userId: string) {
  // Visible = open OR snoozed-but-expired
  // (done never shows)
  const nowISO = new Date().toISOString();

  const { data, error } = await supabase
    .from("decision_inbox")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "done")
    .or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lte.${nowISO})`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
