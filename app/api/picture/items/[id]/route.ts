import { NextResponse } from "next/server";

import { readLimitedJson, requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown item." }, { status: 400 });
  }

  const parsedBody = await readLimitedJson(req, 4 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const assignee =
    parsedBody.value.assignee_user_id === null
      ? null
      : typeof parsedBody.value.assignee_user_id === "string"
        ? parsedBody.value.assignee_user_id
        : undefined;
  if (assignee === undefined) {
    return NextResponse.json({ ok: false, error: "Choose a household member, or leave the item unassigned." }, { status: 400 });
  }
  if (assignee !== null && !/^[0-9a-f-]{36}$/i.test(assignee)) {
    return NextResponse.json({ ok: false, error: "Unknown household member." }, { status: 400 });
  }

  const { data: item, error: itemError } = await auth.supabase
    .from("household_items")
    .select("id,household_id")
    .eq("id", id)
    .maybeSingle();
  if (itemError || !item?.household_id) {
    return NextResponse.json({ ok: false, error: "That item is not in this household." }, { status: 404 });
  }

  if (assignee) {
    const { data: member } = await auth.supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", item.household_id)
      .eq("user_id", assignee)
      .maybeSingle();
    if (!member?.user_id) {
      return NextResponse.json({ ok: false, error: "That person is not in this household." }, { status: 400 });
    }
  }

  const { error } = await auth.supabase
    .from("household_items")
    .update({
      assignee_user_id: assignee,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Life CFO couldn't save that assignment." }, { status: 500 });
  }

  await auth.supabase.from("household_reminders").update({ assignee_user_id: assignee }).eq("item_id", id);

  return NextResponse.json({ ok: true });
}
