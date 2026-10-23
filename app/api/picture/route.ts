import { NextResponse } from "next/server";

import { requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { recordUsage } from "@/lib/usage/recordUsage";

export const dynamic = "force-dynamic";

const CLOSED = new Set(["chapter", "closed", "done", "archived"]);

type MemberRow = { user_id: string; role: string | null };
type ItemRow = {
  id: string;
  kind: string;
  title: string;
  amount_cents: number | null;
  currency: string | null;
  due_on: string | null;
  notes: string | null;
  assignee_user_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  source: string | null;
};
type ReminderRow = {
  id: string;
  item_id: string | null;
  title: string;
  remind_on: string;
  assignee_user_id: string | null;
  created_by: string | null;
};

function memberLabel(userId: string, me: string, role: string | null): string {
  if (userId === me) return "You";
  const short = userId.slice(0, 4);
  const roleLabel = role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
  return `${roleLabel} ${short}`;
}

function emptyPicture(householdId: string | null, notice: string | null) {
  return {
    ok: true,
    household_id: householdId,
    members: [] as { user_id: string; role: string; label: string }[],
    items: [] as ItemRow[],
    reminders: [] as Array<ReminderRow & { seen: boolean }>,
    recent_changes: [] as Array<{ id: string; title: string; verb: string; actor: string; at: string }>,
    decisions: [] as Array<{ id: string; title: string; status: string | null; review_at: string | null }>,
    notice,
  };
}

async function noteHouseholdActive(supabase: unknown, userId: string, householdId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  try {
    const client = supabase as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              gte: (column: string, value: string) => {
                limit: (count: number) => Promise<{ data: { id: string }[] | null }>;
              };
            };
          };
        };
      };
    };
    const { data } = await client
      .from("usage_events")
      .select("id")
      .eq("event_name", "household_active")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .limit(1);
    if (data?.length) return;
  } catch {
    return;
  }
  await recordUsage(supabase, { name: "household_active", userId, householdId });
}

export async function GET() {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(auth.supabase, auth.user.id);
  } catch {
    householdId = null;
  }
  if (!householdId) return NextResponse.json(emptyPicture(null, null));

  await noteHouseholdActive(auth.supabase, auth.user.id, householdId);

  const { data: memberRows } = await auth.supabase
    .from("household_members")
    .select("user_id,role")
    .eq("household_id", householdId);
  const members = ((memberRows ?? []) as MemberRow[]).map((member) => ({
    user_id: member.user_id,
    role: member.role ?? "viewer",
    label: memberLabel(member.user_id, auth.user.id, member.role),
  }));
  const labels = new Map(members.map((member) => [member.user_id, member.label]));

  const itemsResult = await auth.supabase
    .from("household_items")
    .select("id,kind,title,amount_cents,currency,due_on,notes,assignee_user_id,created_by,updated_by,created_at,updated_at,source")
    .eq("household_id", householdId)
    .order("due_on", { ascending: true, nullsFirst: false });

  const decisions = await loadDecisions(auth.supabase, householdId);
  if (itemsResult.error) {
    const body = emptyPicture(householdId, "Apply the latest database migration to see the shared picture.");
    body.members = members;
    body.decisions = decisions;
    return NextResponse.json(body);
  }

  const items = (itemsResult.data ?? []) as ItemRow[];
  const remindersResult = await auth.supabase
    .from("household_reminders")
    .select("id,item_id,title,remind_on,assignee_user_id,created_by")
    .eq("household_id", householdId)
    .order("remind_on", { ascending: true });
  const readsResult = await auth.supabase.from("household_reminder_reads").select("reminder_id").eq("user_id", auth.user.id);
  const seen = new Set((readsResult.data ?? []).map((row) => String(row.reminder_id)));
  const reminders = ((remindersResult.data ?? []) as ReminderRow[]).map((reminder) => ({
    ...reminder,
    seen: seen.has(reminder.id),
  }));

  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recent_changes = items
    .map((item) => {
      const actorId = item.updated_by || item.created_by;
      const at = item.updated_at || item.created_at;
      const verb = item.updated_by && item.updated_by !== item.created_by ? "updated" : "added";
      return { id: item.id, title: item.title, verb, actorId, at };
    })
    .filter((change) => change.actorId && change.actorId !== auth.user.id && Date.parse(change.at) >= cutoff)
    .slice(0, 12)
    .map((change) => ({
      id: change.id,
      title: change.title,
      verb: change.verb,
      actor: labels.get(change.actorId || "") || "Another member",
      at: change.at,
    }));

  return NextResponse.json({
    ok: true,
    household_id: householdId,
    members,
    items,
    reminders,
    recent_changes,
    decisions,
    notice: null,
  });
}

async function loadDecisions(supabase: unknown, householdId: string) {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => Promise<{
              data: Array<{ id: string; title: string; status: string | null; review_at: string | null }> | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data, error } = await client
    .from("decisions")
    .select("id,title,status,review_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.filter((row) => !CLOSED.has(String(row.status || "").toLowerCase()));
}
