import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

function setActiveHouseholdCookie(householdId: string) {
  const cookieStore = cookies();
  // cookies() in route handlers is sync in Next, but you’re already using await elsewhere—either works.
  // Keep it simple here:
  (cookieStore as any).set?.(COOKIE_NAME, householdId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const { data: memberships, error: memErr } = await supabase
      .from("household_members")
      .select("household_id,role,created_at,households(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (memErr) throw memErr;

    const households =
      (memberships ?? []).map((m: any) => ({
        id: m.household_id,
        name: m.households?.name ?? "Household",
        role: m.role ?? "viewer",
      })) ?? [];

    // If the user has no households, return a clear signal
    if (!households.length) {
      return NextResponse.json({ ok: true, households: [], active_household_id: null, needs_household: true });
    }

    // Resolve active household (cookie-first validated, then first membership)
    const active_household_id = await resolveHouseholdIdRoute(supabase, user.id);

    // If we resolved one, ensure cookie is set (cross-device reliability + less fallback work)
    if (active_household_id) {
      // only set if missing or different
      const cookieStore = await cookies();
      const current = cookieStore.get(COOKIE_NAME)?.value ?? null;
      if (current !== active_household_id) {
        cookieStore.set(COOKIE_NAME, active_household_id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
    }

    return NextResponse.json({ ok: true, households, active_household_id, needs_household: false });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Households fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const household_id = typeof body?.household_id === "string" ? body.household_id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });

    // Validate membership before allowing rename
    const { data: mem, error: memErr } = await supabase
      .from("household_members")
      .select("id,role")
      .eq("user_id", user.id)
      .eq("household_id", household_id)
      .limit(1);

    if (memErr) throw memErr;
    if (!mem?.length) return NextResponse.json({ ok: false, error: "Not a member of this household." }, { status: 403 });

    const { error } = await supabase.from("households").update({ name }).eq("id", household_id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Household update failed" }, { status: 500 });
  }
}