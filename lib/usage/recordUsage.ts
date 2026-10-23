type UsageClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  };
};

export async function recordUsage(
  supabase: unknown,
  event: { name: string; userId: string | null; householdId?: string | null }
): Promise<void> {
  try {
    const client = supabase as UsageClient;
    await client.from("usage_events").insert({
      event_name: event.name,
      user_id: event.userId,
      household_id: event.householdId ?? null,
    });
  } catch {
    // Usage records are optional until the migration is applied.
  }
}
