import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { AiDailyLimitError, AiUsageUnavailableError, readAiDailyLimits, sydneyDay } from "@/lib/ai/usageLimit";

/** Reserve one request before the provider is called. Fails closed if the counter cannot be written. */
export async function reserveAiRequest(userId: string): Promise<void> {
  const limits = readAiDailyLimits();
  const { data, error } = await supabaseAdmin().rpc("consume_ai_request", {
    p_user_id: userId,
    p_day: sydneyDay(),
    p_user_limit: limits.perUser,
    p_total_limit: limits.total,
  });

  if (error || typeof data !== "string") {
    console.error("ai_usage_counter_failed");
    throw new AiUsageUnavailableError();
  }
  if (data === "ok") return;
  if (data === "user") throw new AiDailyLimitError("user");
  if (data === "total") throw new AiDailyLimitError("total");
  console.error("ai_usage_counter_failed");
  throw new AiUsageUnavailableError();
}
