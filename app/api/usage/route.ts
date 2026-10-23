import { NextResponse } from "next/server";

import { readLimitedJson, requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { recordUsage } from "@/lib/usage/recordUsage";

export const dynamic = "force-dynamic";

const CLIENT_EVENTS = new Set(["onboarding_completed"]);

export async function POST(req: Request) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const parsedBody = await readLimitedJson(req, 2 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const name = typeof parsedBody.value.event === "string" ? parsedBody.value.event : "";
  if (!CLIENT_EVENTS.has(name)) {
    return NextResponse.json({ ok: false, error: "Unknown event." }, { status: 400 });
  }

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(auth.supabase, auth.user.id);
  } catch {
    householdId = null;
  }
  await recordUsage(auth.supabase, { name, userId: auth.user.id, householdId });
  return NextResponse.json({ ok: true });
}
