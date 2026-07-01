import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getLifeCfoAccess, REAL_DATA_DISABLED_MESSAGE } from "@/lib/server/access/lifeCfoAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manualAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  account_type: z.enum(["everyday", "savings", "credit_card", "loan", "other"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("AUD"),
  current_balance: z.string().trim().max(32).optional().default(""),
});

const accountTypes = {
  everyday: { type: "cash", subtype: "checking" },
  savings: { type: "cash", subtype: "savings" },
  credit_card: { type: "credit", subtype: "credit card" },
  loan: { type: "loan", subtype: "loan" },
  other: { type: "cash", subtype: "other" },
} as const;

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

function parseBalanceCents(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null;

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Please sign in again." },
        { status: 401 }
      );
    }
    if (!getLifeCfoAccess(user).canUseRealDataSources) {
      return NextResponse.json({ ok: false, error: REAL_DATA_DISABLED_MESSAGE }, { status: 403 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] =
      await Promise.all([
        supabase
          .from("household_members")
          .select("role")
          .eq("household_id", householdId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("is_household_owner_or_editor", {
          p_household_id: householdId,
        }),
      ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can add an account." },
        { status: 403 }
      );
    }

    const parsed = manualAccountSchema.safeParse(
      await request.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Check the account details and try again." },
        { status: 400 }
      );
    }

    const currentBalanceCents = parseBalanceCents(parsed.data.current_balance);
    if (currentBalanceCents === null) {
      return NextResponse.json(
        { ok: false, error: "Enter the balance using up to two decimal places." },
        { status: 400 }
      );
    }

    const accountId = crypto.randomUUID();
    const providerAccountId = `manual:${accountId}`;
    const accountType = accountTypes[parsed.data.account_type];
    const { data: account, error: insertError } = await supabase
      .from("accounts")
      .insert({
        id: accountId,
        household_id: householdId,
        user_id: user.id,
        provider: "manual",
        name: parsed.data.name,
        type: accountType.type,
        subtype: accountType.subtype,
        status: "active",
        archived: false,
        currency: parsed.data.currency,
        current_balance_cents: currentBalanceCents,
        available_balance_cents:
          accountType.type === "cash" ? currentBalanceCents : null,
        provider_account_id: providerAccountId,
        external_id: providerAccountId,
        connection_id: null,
      })
      .select(
        "id,name,type,subtype,currency,current_balance_cents,provider,status,created_at"
      )
      .single();

    if (insertError) {
      console.error("manual_account_insert_failed", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      return NextResponse.json(
        { ok: false, error: "Life CFO couldn’t add this account yet. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      account,
      next_href: `/money/import?accountId=${account.id}`,
    });
  } catch (error: unknown) {
    console.error("manual_account_create_unexpected", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t add this account yet. Please try again." },
      { status: 500 }
    );
  }
}
