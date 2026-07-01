// app/api/households/members/route.ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "owner" | "editor" | "viewer";
const isRole = (v: unknown): v is Role => v === "owner" || v === "editor" || v === "viewer";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getMyRole(supabase: SupabaseClient, userId: string, householdId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .limit(1);

  if (error) throw error;
  if (!data?.length) return null;
  return String(data[0]?.role ?? "viewer").toLowerCase();
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const household_id = url.searchParams.get("household_id");
    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });

    // Must be a member to view
    const myRole = await getMyRole(supabase, user.id, household_id);
    if (!myRole) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });

    const { data: members, error } = await supabase
      .from("household_members")
      .select("id, user_id, role, created_at")
      .eq("household_id", household_id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const meEmail = user.email ?? null;

    const enriched =
      (members ?? []).map((m) => {
        const isMe = m.user_id === user.id;
        return {
          membership_id: m.id,
          user_id: m.user_id,
          role: m.role,
          created_at: m.created_at,
          label: isMe ? (meEmail ? `You (${meEmail})` : "You") : "Household member",
          is_me: isMe,
        };
      }) ?? [];

    return NextResponse.json({ ok: true, members: enriched });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error, "Members fetch failed") }, { status: 500 });
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
    const membership_id = typeof body?.membership_id === "string" ? body.membership_id : null;
    const role = body?.role;

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!membership_id) return NextResponse.json({ ok: false, error: "Missing membership_id." }, { status: 400 });
    if (!isRole(role)) return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });

    const { data, error } = await supabase.rpc("set_household_member_role", {
      p_household_id: household_id,
      p_membership_id: membership_id,
      p_role: role,
    });

    if (error) {
      if (error.message.includes("cannot_demote_last_owner")) {
        return NextResponse.json(
          { ok: false, code: "cannot_demote_last_owner", error: "A household needs at least one owner." },
          { status: 400 },
        );
      }
      if (error.message.includes("membership_not_found")) {
        return NextResponse.json({ ok: false, error: "Household member not found." }, { status: 404 });
      }
      if (error.code === "42501") {
        return NextResponse.json({ ok: false, error: "Only a household owner can change roles." }, { status: 403 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, membership: data?.[0] ?? null });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error, "Role update failed") }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const membership_id = typeof body?.membership_id === "string" ? body.membership_id : null;

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!membership_id) return NextResponse.json({ ok: false, error: "Missing membership_id." }, { status: 400 });

    const { data, error } = await supabase.rpc("remove_household_member", {
      p_household_id: household_id,
      p_membership_id: membership_id,
    });

    if (error) {
      if (error.message.includes("use_leave_household")) {
        return NextResponse.json(
          { ok: false, code: "use_leave_household", error: "Use Leave household to remove your own access." },
          { status: 409 },
        );
      }
      if (error.message.includes("cannot_remove_last_owner")) {
        return NextResponse.json(
          { ok: false, code: "cannot_remove_last_owner", error: "A household needs at least one owner." },
          { status: 409 },
        );
      }
      if (error.message.includes("membership_not_found") || error.message.includes("household_not_found")) {
        return NextResponse.json({ ok: false, error: "Household member not found." }, { status: 404 });
      }
      if (error.code === "42501") {
        return NextResponse.json({ ok: false, error: "Only a household owner can remove members." }, { status: 403 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, membership: data?.[0] ?? null });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error, "Remove failed") }, { status: 500 });
  }
}
