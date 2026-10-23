// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";
import { factualMoneyHeadline } from "@/lib/money/reasoning/factualMoneyCopy";
import { guardAskQuestion } from "@/lib/ask/askGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};

const ORIENTATION_KEYWORDS = [
  "are we okay",
  "how are things looking",
  "financial status",
];

const DIAGNOSIS_KEYWORDS = [
  "why does money feel tight",
  "why does money feel",
  "what changed recently",
  "what is the main pressure",
  "main pressure",
  "feel tight",
  "pressure right now",
];

const AFFORDABILITY_KEYWORDS = [
  "can we afford",
  "could we afford",
  "can i afford",
  "could i afford",
  "can we manage this",
  "could we manage this",
  "can we manage that",
  "would this stretch us",
  "would that stretch us",
  "is this affordable",
  "is that affordable",
];

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function readCookie(name: string) {
  const jar = await cookies();
  return jar.get(name)?.value?.trim() || null;
}

async function resolveActiveHouseholdId(
  supabase: any,
  userId: string
): Promise<string | null> {
  const preferred = await readCookie(COOKIE_NAME);

  if (preferred) {
    const { data: okRows, error: okErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", preferred)
      .limit(1);

    if (!okErr && okRows?.length) return preferred;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

async function ensureHouseholdMember(
  supabase: any,
  userId: string,
  householdId: string
) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.household_id) throw new Error("Not a member of this household.");
  return { role: (data.role as string | null) ?? null };
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as AskBody;
    const q = safeStr(body.q).trim();
    const limit = clampInt(body.limit, 3, 30, 10);

    const householdId = await resolveActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { role } = await ensureHouseholdMember(supabase, user.id, householdId);

    const lowerQ = q.toLowerCase();
    const guarded = q ? guardAskQuestion(q) : { allowed: true as const };
    if (!guarded.allowed) {
      return NextResponse.json({
        ok: true,
        mode: "refused",
        household_id: householdId,
        message: guarded.message,
        resources: guarded.resources,
      });
    }

    const looksOrientation =
      !q || ORIENTATION_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksDiagnosis =
      !!q && DIAGNOSIS_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksAffordability =
      !!q && AFFORDABILITY_KEYWORDS.some((kw) => lowerQ.includes(kw));

    if (looksOrientation || looksDiagnosis || looksAffordability) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const sample = (snapshot.connections?.demo ?? 0) > 0;
      explanation.headline = factualMoneyHeadline(sample);
      explanation.insights = explanation.insights.filter(
        (line) => !/committed|room|tight|okay|afford/i.test(line)
      );

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation,
        sample_data: sample,
      });
    }

    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

    async function rowsFor(
      table: "accounts" | "transactions",
      columns: string[],
      select: string,
      orderColumn: string
    ) {
      const results = await Promise.all(
        columns.map((column) =>
          supabase
            .from(table)
            .select(select)
            .eq("household_id", householdId)
            .ilike(column, like)
            .order(orderColumn, { ascending: false })
            .limit(limit)
        )
      );
      const error = results.find((result) => result.error)?.error ?? null;
      const byId = new Map<string, Record<string, unknown>>();
      for (const result of results) {
        const rows = (result.data ?? []) as unknown[];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const id = "id" in row && typeof row.id === "string" ? row.id : "";
          if (id && !byId.has(id)) byId.set(id, row as Record<string, unknown>);
        }
      }
      return { data: [...byId.values()].slice(0, limit), error };
    }

    const [accountsRes, billsRes, txRes] = await Promise.all([
      rowsFor(
        "accounts",
        ["name", "provider", "type", "status"],
        "id,name,provider,type,status,currency,current_balance_cents,updated_at,archived",
        "updated_at"
      ),
      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at")
        .eq("household_id", householdId)
        .ilike("name", like)
        .order("next_due_at", { ascending: true })
        .limit(limit),
      rowsFor(
        "transactions",
        ["merchant", "description", "category"],
        "id,account_id,posted_at,amount_cents,currency,merchant,description,category",
        "posted_at"
      ),
    ]);

    const firstErr = accountsRes.error || billsRes.error || txRes.error;
    if (firstErr) {
      return NextResponse.json(
        {
          ok: false,
          error: firstErr.message,
          debug: {
            accounts_ok: !accountsRes.error,
            bills_ok: !billsRes.error,
            transactions_ok: !txRes.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "search",
      household_id: householdId,
      role,
      q,
      results: {
        accounts: accountsRes.data ?? [],
        bills: billsRes.data ?? [],
        transactions: txRes.data ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ask failed." },
      { status: 500 }
    );
  }
}