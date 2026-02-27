// app/api/households/members/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "owner" | "editor" | "viewer";
const isRole = (v: unknown): v is Role => v === "owner" || v === "editor" || v === "viewer";

function maskId(id: string) {
  if (!id) return "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
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

    if (!household_id) {
      return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    }

    const { data: members, error } = await supabase
      .from("household_members")
      .select("user_id, role, created_at")
      .eq("household_id", household_id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const meEmail = user.email ?? null;

    const enriched =
      (members ?? []).map((m) => {
        const isMe = m.user_id === user.id;
        return {
          user_id: m.user_id,
          role: m.role,
          created_at: m.created_at,
          label: isMe ? meEmail ?? "You" : `Member ${maskId(m.user_id)}`,
          is_me: isMe,
        };
      }) ?? [];

    return NextResponse.json({ ok: true, members: enriched });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Members fetch failed" }, { status: 500 });
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
    const target_user_id = typeof body?.user_id === "string" ? body.user_id : null;
    const role = body?.role;

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!target_user_id) return NextResponse.json({ ok: false, error: "Missing user_id." }, { status: 400 });
    if (!isRole(role)) return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });

    // Guard: do not demote the last owner
    if (role !== "owner") {
      const { data: owners, error: ownersErr } = await supabase
        .from("household_members")
        .select("user_id")
        .eq("household_id", household_id)
        .eq("role", "owner");

      if (ownersErr) throw ownersErr;

      const ownerCount = owners?.length ?? 0;
      const isTargetOwner = owners?.some((o) => o.user_id === target_user_id) ?? false;

      if (isTargetOwner && ownerCount <= 1) {
        return NextResponse.json({ ok: false, error: "cannot_demote_last_owner" }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from("household_members")
      .update({ role })
      .eq("household_id", household_id)
      .eq("user_id", target_user_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Role update failed" }, { status: 500 });
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
    const target_user_id = typeof body?.user_id === "string" ? body.user_id : null;

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!target_user_id) return NextResponse.json({ ok: false, error: "Missing user_id." }, { status: 400 });

    // Guard: do not remove the last owner
    const { data: owners, error: ownersErr } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", household_id)
      .eq("role", "owner");

    if (ownersErr) throw ownersErr;

    const ownerCount = owners?.length ?? 0;
    const isTargetOwner = owners?.some((o) => o.user_id === target_user_id) ?? false;

    if (isTargetOwner && ownerCount <= 1) {
      return NextResponse.json({ ok: false, error: "cannot_remove_last_owner" }, { status: 400 });
    }

    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", household_id)
      .eq("user_id", target_user_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Remove failed" }, { status: 500 });
  }
}