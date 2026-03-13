import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_HOUSEHOLD_CHANGED_EVENT = "lifecfo:active-household-changed";
export const ACTIVE_HOUSEHOLD_STORAGE_KEY = "lifecfo:active-household-id";

export function notifyActiveHouseholdChanged(householdId: string | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(ACTIVE_HOUSEHOLD_CHANGED_EVENT, { detail: { householdId } })
  );

  try {
    window.localStorage.setItem(
      ACTIVE_HOUSEHOLD_STORAGE_KEY,
      JSON.stringify({ householdId, at: Date.now() })
    );
  } catch {
    // no-op
  }
}

export async function resolveActiveHouseholdIdClient(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/households", { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      const activeHouseholdId =
        typeof json.active_household_id === "string" ? json.active_household_id : null;
      if (activeHouseholdId) return activeHouseholdId;
      if (json.needs_household) return null;
    }
  } catch {
    // fallback below
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}
