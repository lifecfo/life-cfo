// app/api/households/invites/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "owner" | "editor" | "viewer";
const isRole = (v: unknown): v is Role => v === "owner" || v === "editor" || v === "viewer";

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(supabase: any) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return { user: null, error: "Not signed in." as string };
  return { user, error: null as string | null };
}

async function requireHouseholdRole(supabase: any, userId: string, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .limit(1);

  if (error) throw error;
  const role = (data?.[0]?.role ?? "viewer") as string;
  return role;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { user, error } = await requireUser(supabase);
    if (error || !user) return NextResponse.json({ ok: false, error }, { status: 401 });

    const url = new URL(req.url);
    const household_id = url.searchParams.get("household_id");

    if (household_id) {
      // List invites for a household (members can view; UI restricts actions)
      const { data, error: invErr } = await supabase
        .from("household_invites")
        .select("id,email,role,status,created_at")
        .eq("household_id", household_id)
        .order("created_at", { ascending: false });

      if (invErr) throw invErr;
      return NextResponse.json({ ok: true, invites: data ?? [] });
    }

    // List invites for current user email (accept/decline from /invites page)
    const email = (user.email ?? "").toLowerCase();
    if (!email) return NextResponse.json({ ok: true, invites: [] });

    const { data, error: invErr } = await supabase
      .from("household_invites")
      .select("id,household_id,email,role,status,created_at,households(name)")
      .eq("status", "pending")
      .ilike("email", email)
      .order("created_at", { ascending: false });

    if (invErr) throw invErr;

    const invites =
      (data ?? []).map((r: any) => ({
        id: r.id,
        household_id: r.household_id,
        household_name: r.households?.name ?? "Household",
        email: r.email,
        role: r.role,
        status: r.status,
        created_at: r.created_at,
      })) ?? [];

    return NextResponse.json({ ok: true, invites });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Invites fetch failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { user, error } = await requireUser(supabase);
    if (error || !user) return NextResponse.json({ ok: false, error }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const household_id = typeof body?.household_id === "string" ? body.household_id : null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role;

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });
    if (!isRole(role)) return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
    if (role === "owner") return NextResponse.json({ ok: false, error: "Invites cannot grant owner." }, { status: 400 });

    const myRole = (await requireHouseholdRole(supabase, user.id, household_id)).toLowerCase();
    if (!(myRole === "owner" || myRole === "editor")) {
      return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
    }

    const admin = adminSupabase();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY on server." },
        { status: 500 }
      );
    }

    // Avoid duplicates: if already a member, do nothing
    const { data: existingMember, error: memErr } = await admin
      .from("household_members")
      .select("user_id")
      .eq("household_id", household_id)
      .limit(1);

    if (memErr) throw memErr;

    // Create invite
    const token = crypto.randomBytes(24).toString("hex");

    const { error: insErr } = await admin.from("household_invites").insert({
      household_id,
      invited_by: user.id,
      email,
      role,
      token,
      status: "pending",
    });

    if (insErr) throw insErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Invite create failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { user, error } = await requireUser(supabase);
    if (error || !user) return NextResponse.json({ ok: false, error }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    const action = typeof body?.action === "string" ? body.action : null;

    if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
    if (!action) return NextResponse.json({ ok: false, error: "Missing action." }, { status: 400 });

    const admin = adminSupabase();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY on server." },
        { status: 500 }
      );
    }

    // Load invite (admin bypasses RLS)
    const { data: inv, error: invErr } = await admin
      .from("household_invites")
      .select("id,household_id,email,role,status")
      .eq("id", id)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!inv?.id) return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });

    const currentStatus = (inv.status ?? "").toLowerCase();
    if (currentStatus !== "pending") {
      return NextResponse.json({ ok: false, error: "Invite is not pending." }, { status: 400 });
    }

    if (action === "cancel") {
      // Only owner/editor can cancel
      const myRole = (await requireHouseholdRole(supabase, user.id, inv.household_id)).toLowerCase();
      if (!(myRole === "owner" || myRole === "editor")) {
        return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
      }

      const { error: updErr } = await admin
        .from("household_invites")
        .update({ status: "cancelled", responded_at: new Date().toISOString() })
        .eq("id", id);

      if (updErr) throw updErr;
      return NextResponse.json({ ok: true });
    }

    if (action === "accept" || action === "decline") {
      const myEmail = (user.email ?? "").toLowerCase();
      if (!myEmail || myEmail !== (inv.email ?? "").toLowerCase()) {
        return NextResponse.json({ ok: false, error: "This invite is not for your email." }, { status: 403 });
      }

      if (action === "decline") {
        const { error: updErr } = await admin
          .from("household_invites")
          .update({ status: "declined", responded_at: new Date().toISOString() })
          .eq("id", id);

        if (updErr) throw updErr;
        return NextResponse.json({ ok: true });
      }

      // accept
      const { error: upsertErr } = await admin
        .from("household_members")
        .upsert(
          { household_id: inv.household_id, user_id: user.id, role: inv.role ?? "viewer" },
          { onConflict: "household_id,user_id" }
        );

      if (upsertErr) throw upsertErr;

      const { error: updErr } = await admin
        .from("household_invites")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", id);

      if (updErr) throw updErr;

      return NextResponse.json({ ok: true, household_id: inv.household_id });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Invite update failed" }, { status: 500 });
  }
}