import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertFinePrintAccepted(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("fine_print_accepted_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("We couldn't confirm your acceptance of the Life CFO fine print.");
  }

  if (!data?.fine_print_accepted_at) {
    throw new Error("Please review and accept the Life CFO fine print before connecting a bank.");
  }
}
