// lib/ask/resolveHomeAsk.ts
import { createClient } from "@supabase/supabase-js";

/**
 * ============================
 * Home Ask — Core Resolver
 * ============================
 *
 * Canonical engine for:
 * - Intent classification
 * - Safe data retrieval
 * - Grounded snapshot building
 * - Escalation to Capture seed (Framing-style)
 *
 * ❗️NO UI
 * ❗️NO side effects
 * ❗️READ-ONLY
 */

export type AskIntent = "state" | "find" | "compare" | "afford" | "attention" | "unknown";

export type AskAction =
  | "open_bills"
  | "open_money"
  | "open_goals"
  | "open_decisions"
  | "open_review"
  | "open_chapters"
  | "create_capture"
  | "none";

export type AskResult = {
  answer: string;
  action: AskAction;
  suggested_next?: "create_capture";
  // NOTE: kept name "framing_seed" to avoid breaking callers,
  // but it represents a Capture seed (title + prompt + notes).
  framing_seed?: {
    title: string;
    prompt: string;
    notes: string[];
  };
};

/**
 * ---------- Intent detection ----------
 * Small, deterministic, conservative.
 */
export function classifyIntent(question: string): AskIntent {
  const q = question.toLowerCase();

  if (/(can we|should we|afford|safe to)/.test(q)) return "afford";
  if (/(what bills|what decisions|what captures|what is due|what's due)/.test(q)) return "state";
  if (/(find|where is|what did we decide|show me)/.test(q)) return "find";
  if (/(compare|vs|change|difference|last month)/.test(q)) return "compare";
  if (/(what should i look at|anything i should check)/.test(q)) return "attention";

  return "unknown";
}

function isGoalsQuery(question: string) {
  const q = (question || "").toLowerCase();
  return /\b(goal|goals|money goal|money goals|savings goal|savings goals|target|targets|milestone|milestones)\b/.test(q);
}

function moneyFmt(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "AUD").toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(currency || "AUD").toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

function fmtDateShort(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * ---------- Resolver ----------
 */
export async function resolveHomeAsk(args: { userId: string; question: string }): Promise<AskResult> {
  const { userId, question } = args;
  const intent = classifyIntent(question);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); // server-only

  const now = new Date();
  const nowIso = now.toISOString();

  /**
   * ============================
   * B) GOALS (read-only snapshot)
   * ============================
   * Deterministic: count + titles.
   */
  if (isGoalsQuery(question)) {
    // Active = not archived (and not done/paused depending on your usage).
    // We’ll treat archived as out of view, everything else as “active-ish”.
    const { data: goals, error } = await supabase
      .from("money_goals")
      .select("id,title,status,currency,target_cents,current_cents,deadline_at,is_primary,updated_at,created_at")
      .eq("user_id", userId)
      .limit(200);

    if (error || !goals) {
      return {
        answer: "I can’t see your goals right now (from what I can see).",
        action: "open_goals",
      };
    }

    const normalize = (s: any) => {
      const t = String(s ?? "active").trim().toLowerCase();
      if (t === "archived") return "archived";
      if (t === "done") return "done";
      if (t === "paused") return "paused";
      return "active";
    };

    const rows = goals.map((g: any) => ({
      id: String(g.id),
      title: String(g.title ?? "Goal").trim() || "Goal",
      status: normalize(g.status),
      currency: String(g.currency ?? "AUD").toUpperCase(),
      target_cents: typeof g.target_cents === "number" ? g.target_cents : g.target_cents == null ? null : Number(g.target_cents),
      current_cents:
        typeof g.current_cents === "number" ? g.current_cents : g.current_cents == null ? null : Number(g.current_cents),
      deadline_at: typeof g.deadline_at === "string" ? g.deadline_at : null,
      is_primary: typeof g.is_primary === "boolean" ? g.is_primary : false,
      updated_at: typeof g.updated_at === "string" ? g.updated_at : null,
      created_at: typeof g.created_at === "string" ? g.created_at : null,
    }));

    const visible = rows.filter((g) => g.status !== "archived");
    const count = visible.length;

    if (count === 0) {
      return {
        answer: "There are no active goals (from what I can see).",
        action: "open_goals",
      };
    }

    const primary = visible.find((g) => g.is_primary) ?? null;

    const preview = [...visible]
      .sort((a, b) => {
        const ap = a.is_primary ? 1 : 0;
        const bp = b.is_primary ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const au = Date.parse(a.updated_at || a.created_at || "") || 0;
        const bu = Date.parse(b.updated_at || b.created_at || "") || 0;
        return bu - au;
      })
      .slice(0, 3);

    const parts: string[] = [];
    parts.push(`There are ${count} active goals.`);

    if (primary) {
      const cur = typeof primary.current_cents === "number" && Number.isFinite(primary.current_cents) ? primary.current_cents : null;
      const tgt = typeof primary.target_cents === "number" && Number.isFinite(primary.target_cents) ? primary.target_cents : null;

      const bit =
        cur != null && tgt != null
          ? ` (${moneyFmt(cur, primary.currency)} / ${moneyFmt(tgt, primary.currency)})`
          : cur != null
            ? ` (${moneyFmt(cur, primary.currency)})`
            : "";

      parts.push(`Primary goal: ${primary.title}${bit}.`);
    }

    if (preview.length > 0) {
      parts.push(`Including: ${preview.map((g) => g.title).join(", ")}.`);
    }

    return {
      answer: parts.join(" "),
      action: "open_goals",
    };
  }

  /**
   * ============================
   * A) STATE QUERIES
   * ============================
   */
  if (intent === "state") {
    // Bills due in next 30 days (default window)
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: bills } = await supabase
      .from("recurring_bills")
      .select("name,amount_cents,currency,next_due_at,autopay")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("next_due_at", nowIso)
      .lt("next_due_at", end.toISOString())
      .order("next_due_at", { ascending: true })
      .limit(6);

    if (!bills || bills.length === 0) {
      return {
        answer: `I don’t see any bills due in the next 30 days (from what I can see).`,
        action: "open_bills",
      };
    }

    const lines = bills.map((b: any) => {
      const amt = typeof b.amount_cents === "number" ? moneyFmt(b.amount_cents, (b.currency || "AUD").toUpperCase()) : "—";
      const due = b.next_due_at ? new Date(b.next_due_at).toLocaleDateString() : "—";
      const name = String(b.name ?? "Bill").trim() || "Bill";
      return `• ${name} — ${due} — ${amt}${b.autopay ? " (autopay)" : ""}`;
    });

    return {
      answer: `In the next 30 days (until ${end.toLocaleDateString()}), you have:\n\n${lines.join("\n")}`,
      action: "open_bills",
    };
  }

  /**
   * ============================
   * D) AFFORD / SHOULD WE
   * ============================
   * ❗ Never grant permission
   * ❗ Frame only
   */
  if (intent === "afford") {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("name,current_balance_cents,currency")
      .eq("user_id", userId)
      .eq("archived", false);

    const { data: upcomingBills } = await supabase
      .from("recurring_bills")
      .select("name,amount_cents,currency,next_due_at")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("next_due_at", nowIso)
      .limit(6);

    // Conservative: we keep your current V1 assumption (single AUD framing total),
    // because this resolver is framing-only and should not “calculate” mixed currency.
    const cashTotal =
      accounts?.reduce((sum, a: any) => {
        const n = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
        return sum + n;
      }, 0) ?? 0;

    const billTotal =
      upcomingBills?.reduce((sum, b: any) => {
        const n = typeof b.amount_cents === "number" ? b.amount_cents : 0;
        return sum + n;
      }, 0) ?? 0;

    return {
      answer: [
        `Here’s what I can see right now:`,
        ``,
        `• Available cash across accounts: ${moneyFmt(cashTotal, "AUD")}`,
        `• Upcoming committed bills: ${moneyFmt(billTotal, "AUD")}`,
        ``,
        `I can’t say “yes” or “no” from here — but we can frame it so it’s safe and clear.`,
      ].join("\n"),
      action: "open_money",
      suggested_next: "create_capture",
      framing_seed: {
        title: question,
        prompt: question,
        notes: [
          "Goal: assess affordability without granting permission",
          "Known: current cash position (accounts)",
          "Known: upcoming commitments (active recurring bills)",
          "Unknown: exact timing and which account it comes from",
          "Unknown: whether this is one-off or recurring",
          "Unknown: the buffer you want to keep",
        ],
      },
    };
  }

  /**
   * ============================
   * FALLBACK
   * ============================
   */
  return {
    answer: "I can’t confidently answer that yet with the data I have. If this matters, we can capture it properly.",
    action: "none",
    suggested_next: "create_capture",
    framing_seed: {
      title: question,
      prompt: question,
      notes: ["More context is needed to answer safely from data."],
    },
  };
}
