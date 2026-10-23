import { NextResponse } from "next/server";

import { readLimitedJson, requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { sanitiseDraftItems } from "@/lib/picture/draftItems";
import { recordUsage } from "@/lib/usage/recordUsage";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const parsedBody = await readLimitedJson(req, 64 * 1024);
  if (!parsedBody.ok) return parsedBody.response;

  const items = sanitiseDraftItems(parsedBody.value.items);
  if (!items.length) {
    return NextResponse.json({ ok: false, error: "Add at least one item with a title." }, { status: 400 });
  }
  const source = parsedBody.value.source === "brain_dump" ? "brain_dump" : "manual";

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(auth.supabase, auth.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Household lookup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  if (!householdId) {
    return NextResponse.json({ ok: false, error: "Create a household before saving items." }, { status: 400 });
  }

  const rows = items.map((item) => ({
    household_id: householdId,
    created_by: auth.user.id,
    updated_by: auth.user.id,
    kind: item.kind,
    title: item.title,
    amount_cents: item.amount_cents,
    currency: "AUD",
    due_on: item.due_on,
    notes: item.notes,
    assignee_user_id: null,
    source,
  }));

  const { data, error } = await auth.supabase.from("household_items").insert(rows).select("id,title,due_on,assignee_user_id");
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't save those items. Apply the latest database migration, then try again." },
      { status: 503 }
    );
  }

  const reminders = (data ?? [])
    .filter((row) => typeof row.due_on === "string" && row.due_on)
    .map((row) => ({
      household_id: householdId,
      item_id: row.id,
      created_by: auth.user.id,
      assignee_user_id: row.assignee_user_id,
      title: row.title,
      remind_on: row.due_on,
    }));
  if (reminders.length) {
    await auth.supabase.from("household_reminders").insert(reminders);
  }

  if (source === "brain_dump") {
    await recordUsage(auth.supabase, {
      name: "brain_dump_used",
      userId: auth.user.id,
      householdId,
    });
  }

  return NextResponse.json({ ok: true, saved: data?.length ?? items.length });
}
