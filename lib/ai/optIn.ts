import "server-only";

export const AI_OFF_MESSAGE =
  "AI Ask is off. Life CFO has not sent this to an overseas provider. You can turn it on in Settings after reading that OpenAI or Anthropic may process the question outside Australia. Life CFO can still list figures, dates, and items you typed.";

export async function aiAskOptedIn(supabase: unknown, userId: string): Promise<boolean> {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { ai_ask_opt_in_at?: string | null } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("profiles")
    .select("ai_ask_opt_in_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.ai_ask_opt_in_at) return false;
  return true;
}
