// app/api/delete-account/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await supabaseRoute();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json(
        { ok: false, code: "not_authenticated", error: "Please sign in again." },
        { status: 401 }
      );
    }

    // Self-service deletion is paused until household ownership, provider revocation,
    // shared data, and export behaviour are implemented.
    return NextResponse.json(
      {
        ok: false,
        code: "self_service_deletion_paused",
        error: "Account deletion is handled with support during private beta.",
      },
      { status: 409 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "unexpected_error", error: "Please try again." },
      { status: 500 }
    );
  }
}
