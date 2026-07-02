// app/(app)/lifecfo-home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";
import { useRouter } from "next/navigation";
import { maybeCrisisIntercept } from "@/lib/safety/guard";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import type {
  MoneyByCurrencyRow,
  MoneyDataCoverage,
  MoneyHomeSummary,
} from "@/lib/money/reasoning/types";
import { useLifeCfoAccess } from "@/lib/access/useLifeCfoAccess";

export const dynamic = "force-dynamic";

/* ---------- helpers ---------- */

function firstNameOf(full: string) {
  const s = (full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

function isYesish(s: string) {
  const t = s.trim().toLowerCase();
  return ["y", "yes", "yep", "yeah", "sure", "ok", "okay"].includes(t);
}

/**
 * Make answers look calm even if the model returns light markdown.
 * We keep this minimal + safe: don't "render markdown", just clean it.
 */
function cleanAnswer(raw: string) {
  let t = (raw || "").trim();
  if (!t) return "";

  // normalize line endings
  t = t.replace(/\r\n/g, "\n");

  // **bold** -> plain
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");

  // leading "- " -> "• "
  t = t.replace(/^\s*-\s+/gm, "• ");

  // collapse excessive blank lines
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

function formatCheckedAt(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------- CFO memo shaping (Q&A memo) ---------- */

type MemoTone = "ok" | "tight" | "attention";

function inferTone(text: string): MemoTone {
  const t = (text || "").toLowerCase();

  // attention signals
  if (
    /(insufficient|overdue|past due|urgent|immediately|cannot|can’t|risk|at risk|missed|late fee|failed|error|shortfall|negative)/i.test(
      t
    )
  ) {
    return "attention";
  }

  // tight but not alarming
  if (/(tight|close|careful|reduce|cut back|watch|monitor|buffer|low|smaller margin|limited)/i.test(t)) {
    return "tight";
  }

  // default calm
  return "ok";
}

function splitHeadlineAndBody(answer: string): { headline: string; body: string } {
  const a = (answer || "").trim();
  if (!a) return { headline: "", body: "" };

  // Prefer first non-empty line as headline if it reads like a sentence.
  const lines = a
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headline: "", body: "" };

  const first = lines[0];

  // If first line is short bullet-like, try first sentence from whole text.
  const looksBullet = first.startsWith("•") || first.startsWith("-") || first.startsWith("*");
  const looksTooShort = first.length < 24;

  if (looksBullet || looksTooShort) {
    const firstSentence = a.split(/(?<=[.!?])\s+/)[0]?.trim() || first;
    const rest = a.slice(firstSentence.length).trim();
    return { headline: firstSentence, body: rest };
  }

  // If first line is long, keep it as headline, rest as body.
  const body = lines.slice(1).join("\n").trim();
  return { headline: first, body };
}

function extractBullets(text: string): string[] {
  const lines = (text || "").split("\n").map((s) => s.trim());
  const bullets = lines
    .filter((l) => l.startsWith("• "))
    .map((l) => l.replace(/^•\s+/, "").trim())
    .filter(Boolean);

  // If there are no bullets, create a light structure from paragraphs (max 3).
  if (bullets.length === 0) {
    const paras = (text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) => !l.toLowerCase().startsWith("you asked:"));

    // Take up to 3 meaningful lines
    return paras.slice(0, 3);
  }

  return bullets.slice(0, 5);
}

function tonePill(tone: MemoTone) {
  if (tone === "attention") return { label: "Needs attention", className: "bg-zinc-900 text-white" };
  if (tone === "tight") return { label: "A bit tight", className: "bg-white text-zinc-800 border border-zinc-200" };
  return { label: "All clear", className: "bg-white text-zinc-700 border border-zinc-200" };
}

function calmWhatWouldChange(tone: MemoTone): string[] {
  if (tone === "attention") {
    return ["If income lands later than expected", "If a bill date is earlier than listed", "If current balances are lower than recorded"];
  }
  if (tone === "tight") {
    return ["If one extra cost appears this week", "If a bill is higher than usual", "If income timing shifts"];
  }
  return ["If a new bill is added", "If income timing changes", "If a large one-off expense appears"];
}

function calmAssumptions(): string[] {
  return ["Bills and due dates are up to date", "Account balances are current", "No large untracked expenses are pending"];
}

function formatMoneyRows(rows: MoneyByCurrencyRow[]) {
  if (!rows.length) return "Not visible yet";
  return rows
    .map((row) => formatMoneyFromCents(row.cents, row.currency))
    .join(" | ");
}

function hasVisibleMoney(coverage: MoneyDataCoverage) {
  return coverage.account_count > 0 || coverage.transaction_count > 0;
}

function sourceNames(coverage: MoneyDataCoverage) {
  const names = coverage.included_sources.map(
    (source) => source.provider.charAt(0).toUpperCase() + source.provider.slice(1)
  );
  return names.length ? names.join(" and ") : "No current source";
}

function visibleMoneySummary(coverage: MoneyDataCoverage) {
  const hasAccounts = coverage.account_count > 0;
  const hasTransactions = coverage.transaction_count > 0;

  if (hasAccounts && hasTransactions) {
    return coverage.has_demo_sources
      ? "Life CFO can see demo accounts and recent transactions for this household."
      : "Life CFO can see account balances and recent transactions for this household.";
  }
  if (hasAccounts) {
    return coverage.has_demo_sources
      ? "Life CFO can see demo account balances for this household."
      : "Life CFO can see account balances for this household.";
  }
  return coverage.has_demo_sources
    ? "Life CFO can see recent demo transactions for this household."
    : "Life CFO can see recent transactions for this household.";
}

/* ---------- types ---------- */

type ApiAction = "open_money" | "open_decisions" | "open_chapters" | "none";

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "done";
      question: string;
      answer: string;
      actionHref?: string | null;
    }
  | { status: "error"; question: string; message: string };

type HomeMoneyOverview = {
  snapshot: {
    asOf: string;
    liquidity: { availableCashCents: number; accountCount: number };
    income: { sourceCount: number };
    commitments: { billCount: number };
  };
  data_coverage: MoneyDataCoverage;
  home_summary: MoneyHomeSummary;
};

type HomeMoneyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; overview: HomeMoneyOverview }
  | { status: "error"; message: string };

type TriageState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      reviewDueCount: number;
      reviewSoonCount: number;
      openDecisionCount: number;
      freshAskPromotionTitle: string | null;
    }
  | { status: "error" };

type HomeNowItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  priority: number;
};

/* ---------- routing helpers ---------- */

function actionToHref(action: ApiAction | undefined): string | null {
  if (action === "open_money") return "/money";
  if (action === "open_decisions") return "/decisions?tab=active";
  if (action === "open_chapters") return "/chapters";
  return null;
}

/* ---------- page ---------- */

export default function LifeCFOHomePage() {
  const access = useLifeCfoAccess();
  const router = useRouter();
  const { toast } = useToast();
  const { openAsk: openGlobalAsk, setDraft: setAskDraft } = useAsk();
  const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP || "";

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState("");

  const [text, setText] = useState("");
  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  const [showDetails, setShowDetails] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const [homeMoney, setHomeMoney] = useState<HomeMoneyState>({ status: "idle" });
  const [triage, setTriage] = useState<TriageState>({ status: "idle" });
  const [showQuickAsk, setShowQuickAsk] = useState(false);

  // follow-up (inline, keeps context on-screen)
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpSending, setFollowUpSending] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const followUpRef = useRef<HTMLDivElement | null>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);
  const triageRefreshTimerRef = useRef<number | null>(null);

  const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);
  const scrollToAnswer = () =>
    window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  const scrollToFollowUp = () =>
    window.setTimeout(() => followUpRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
  const focusFollowUp = () => window.setTimeout(() => followUpInputRef.current?.focus(), 0);
  const continueInAsk = (seed = "") => {
    setAskDraft(seed);
    openGlobalAsk();
  };

  /* ---------- auth ---------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("fine_print_signed_name").eq("user_id", userId).maybeSingle();
      if (!alive) return;

      const full = typeof data?.fine_print_signed_name === "string" ? data.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  /* ---------- household money check-in ---------- */

  async function runStatusCheck() {
    if (!userId) return;

    setHomeMoney((state) => (state.status === "ready" ? state : { status: "loading" }));

    try {
      const response = await fetch("/api/money/overview", {
        method: "GET",
        cache: "no-store",
      });
      const overview = (await response.json().catch(() => null)) as HomeMoneyOverview | null;

      if (!response.ok || !overview?.snapshot || !overview.data_coverage || !overview.home_summary) {
        setHomeMoney({ status: "error", message: "I couldn’t load your household picture right now." });
        return;
      }

      setHomeMoney({ status: "ready", overview });
    } catch {
      setHomeMoney({ status: "error", message: "I couldn’t load your household picture right now." });
    }
  }

  useEffect(() => {
    if (authStatus !== "signed_in" || !userId) return;
    void runStatusCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, userId]);

  async function loadTriage(u: string) {
    setTriage({ status: "loading" });
    try {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,title,origin,status,decided_at,review_at,reviewed_at,created_at")
        .eq("user_id", u)
        .limit(200);

      if (error) {
        setTriage({ status: "error" });
        return;
      }

      const rows = (Array.isArray(data) ? data : []) as Array<{
        title?: unknown;
        origin?: unknown;
        status?: unknown;
        decided_at?: unknown;
        review_at?: unknown;
        reviewed_at?: unknown;
        created_at?: unknown;
      }>;
      const now = Date.now();
      const soonMs = now + 14 * 24 * 60 * 60 * 1000;
      const freshCutoffMs = now - 2 * 60 * 60 * 1000;

      let reviewDueCount = 0;
      let reviewSoonCount = 0;
      let openDecisionCount = 0;
      let freshAskPromotionTitle: string | null = null;
      let freshAskPromotionMs = 0;

      for (const row of rows) {
        const status = String(row.status ?? "").toLowerCase();
        const decidedAt = typeof row.decided_at === "string" ? row.decided_at : null;
        const reviewAt = typeof row.review_at === "string" ? row.review_at : null;
        const reviewedAt = typeof row.reviewed_at === "string" ? row.reviewed_at : null;
        const createdAt = typeof row.created_at === "string" ? row.created_at : null;
        const createdMs = createdAt ? Date.parse(createdAt) : NaN;
        const title = typeof row.title === "string" ? row.title.trim() : "";
        const origin = typeof row.origin === "string" ? row.origin.trim().toLowerCase() : "";

        if (!decidedAt && status !== "chapter" && status !== "closed") {
          openDecisionCount += 1;
        }

        if (origin === "ask_promotion" && Number.isFinite(createdMs) && createdMs >= freshCutoffMs && createdMs > freshAskPromotionMs) {
          freshAskPromotionMs = createdMs;
          freshAskPromotionTitle = title || "New promoted decision";
        }

        if (!reviewAt || reviewedAt) continue;
        const reviewMs = Date.parse(reviewAt);
        if (Number.isNaN(reviewMs)) continue;
        if (reviewMs <= now) reviewDueCount += 1;
        else if (reviewMs <= soonMs) reviewSoonCount += 1;
      }

      setTriage({
        status: "ready",
        reviewDueCount,
        reviewSoonCount,
        openDecisionCount,
        freshAskPromotionTitle,
      });
    } catch {
      setTriage({ status: "error" });
    }
  }

  useEffect(() => {
    if (authStatus !== "signed_in" || !userId) {
      setTriage({ status: "idle" });
      return;
    }
    void loadTriage(userId);
  }, [authStatus, userId]);

  useEffect(() => {
    if (authStatus !== "signed_in" || !userId) return;

    const scheduleRefresh = () => {
      if (triageRefreshTimerRef.current) {
        window.clearTimeout(triageRefreshTimerRef.current);
      }
      triageRefreshTimerRef.current = window.setTimeout(() => {
        void loadTriage(userId);
      }, 250);
    };

    const ch = supabase
      .channel(`home-triage-decisions-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .subscribe();

    return () => {
      if (triageRefreshTimerRef.current) {
        window.clearTimeout(triageRefreshTimerRef.current);
        triageRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [authStatus, userId]);

  /* ---------- ask ---------- */

  const askHome = async (question: string) => {
    if (!userId) return;

    setAsk({ status: "loading", question });
    setShowDetails(false);
    setShowWhy(false);
    setShowAssumptions(false);

    // close follow-up composer when a new answer begins
    setFollowUpOpen(false);

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question }),
      });

      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
        scrollToAnswer();
        return;
      }

      const answer = cleanAnswer(typeof json?.answer === "string" ? json.answer : "");
      const actionHref = actionToHref(json?.action as ApiAction);

      setAsk({
        status: "done",
        question,
        answer,
        actionHref,
      });

      scrollToAnswer();
    } catch {
      setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
      scrollToAnswer();
    }
  };

  /* ---------- submit (ANSWER-FIRST, always) ---------- */

  const submit = async () => {
    const msg = text.trim();
    if (!msg) return;

    setShowQuickAsk(true);
    setText("");
    focusInput();

    if (authStatus !== "signed_in" || !userId) {
      setAsk({ status: "error", question: msg, message: "Sign in to ask Life CFO." });
      scrollToAnswer();
      return;
    }

    // Crisis intercept (no save, no AI)
    const intercept = maybeCrisisIntercept(msg);
    if (intercept) {
      setAsk({ status: "done", question: msg, answer: intercept.content, actionHref: null });
      scrollToAnswer();
      return;
    }

    // “yes” follow-up after an answer (simple affordance)
    if (isYesish(msg) && ask.status === "done") {
      await askHome(`${ask.question}\n\nUser follow-up: yes.`);
      return;
    }

    await askHome(msg);
  };

  /* ---------- follow-up (inline, keeps context) ---------- */

  const submitFollowUp = async () => {
    const fu = followUpText.trim();
    if (!fu) return;

    if (followUpSending) return;
    setShowQuickAsk(true);

    if (authStatus !== "signed_in" || !userId) {
      toast({ title: "Sign in", description: "Sign in to ask a follow-up." });
      return;
    }

    setFollowUpSending(true);

    try {
      const intercept = maybeCrisisIntercept(fu);
      if (intercept) {
        setAsk({ status: "done", question: fu, answer: intercept.content, actionHref: null });
        setFollowUpOpen(false);
        setFollowUpText("");
        scrollToAnswer();
        return;
      }

      // stitch context safely (no storage; only for this request)
      const parentQ = ask.status === "done" ? ask.question : "";
      const parentA = ask.status === "done" ? cleanAnswer(ask.answer || "") : "";
      const stitched =
        ask.status === "done"
          ? `Context:
- Previous question: ${parentQ}
- Previous answer (summary): ${parentA}

Follow-up question: ${fu}`
          : fu;

      setFollowUpText("");
      setFollowUpOpen(false);

      await askHome(stitched);
    } finally {
      setFollowUpSending(false);
    }
  };

  /* ---------- memo view model (Q&A) ---------- */

  const memo = useMemo(() => {
    if (ask.status !== "done") return null;
    const tone = inferTone(ask.answer || "");
    const { headline, body } = splitHeadlineAndBody(ask.answer || "");
    const bullets = extractBullets(body || "");
    return { tone, headline, body, bullets };
  }, [ask]);

  const whatMattersNow = useMemo(() => {
    if (authStatus !== "signed_in") return [] as HomeNowItem[];

    const items: HomeNowItem[] = [];
    const push = (item: HomeNowItem) => {
      if (items.some((x) => x.key === item.key)) return;
      items.push(item);
    };

    if (homeMoney.status === "ready") {
      const { data_coverage: coverage, snapshot } = homeMoney.overview;
      if (!hasVisibleMoney(coverage)) {
        push({
          key: "money_visibility",
          title: "Needs more visibility",
          detail: "Add or refresh a money source to bring household balances and transactions into view.",
          href: "/money",
          priority: 70,
        });
      } else {
        if (coverage.current_month_money_in.length || coverage.current_month_money_out.length) {
          push({
            key: "month_activity",
            title: "This month’s money is visible",
            detail: `${formatMoneyRows(coverage.current_month_money_in)} in and ${formatMoneyRows(coverage.current_month_money_out)} out.`,
            href: "/money",
            priority: 72,
          });
        }
        if (coverage.account_count > 0) {
          const currency =
            coverage.current_month_money_in[0]?.currency ||
            coverage.current_month_money_out[0]?.currency ||
            "AUD";
          push({
            key: "available_cash",
            title: `Available cash: ${formatMoneyFromCents(snapshot.liquidity.availableCashCents, currency)}`,
            detail: `${coverage.account_count} current account${coverage.account_count === 1 ? "" : "s"} are included in this household picture.`,
            href: "/money/saved",
            priority: 68,
          });
        }
        if (snapshot.income.sourceCount === 0 || snapshot.commitments.billCount === 0) {
          push({
            key: "formal_setup",
            title: "Observed money is already available",
            detail: "Formal income and bill setup stays separate from observed and confirmed patterns.",
            href: "/money",
            priority: 40,
          });
        }
      }
    }

    if (triage.status === "ready") {
      if (triage.freshAskPromotionTitle) {
        push({
          key: "fresh_ask_promotion",
          title: "New decision captured",
          detail: triage.freshAskPromotionTitle,
          href: "/decisions?tab=active",
          priority: 98,
        });
      }

      if (triage.reviewDueCount > 0) {
        push({
          key: "reviews_due",
          title: triage.reviewDueCount === 1 ? "1 review is due" : `${triage.reviewDueCount} reviews are due`,
          detail: "Check your active decisions to close the loop.",
          href: "/decisions?tab=active",
          priority: 95,
        });
      } else if (triage.reviewSoonCount > 0) {
        push({
          key: "reviews_soon",
          title: triage.reviewSoonCount === 1 ? "1 review is coming up" : `${triage.reviewSoonCount} reviews are coming up`,
          detail: "A quick pass in Decisions keeps upcoming reviews calm.",
          href: "/decisions?tab=active",
          priority: 65,
        });
      }

      if (triage.openDecisionCount > 0) {
        push({
          key: "open_decisions",
          title: triage.openDecisionCount === 1 ? "1 active decision" : `${triage.openDecisionCount} active decisions`,
          detail: "Keep commitments clear in Decisions.",
          href: "/decisions?tab=active",
          priority: 60,
        });
      }
    }

    return items.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }, [authStatus, homeMoney, triage]);

  const comingUpItems = useMemo(() => {
    if (homeMoney.status !== "ready") return [] as HomeNowItem[];
    const summary = homeMoney.overview.home_summary;
    const items: HomeNowItem[] = [];
    const [firstBill, ...otherBills] = summary.upcoming_bills;

    if (firstBill) {
      const timing =
        firstBill.days_until_due === 0
          ? "today"
          : firstBill.days_until_due === 1
            ? "tomorrow"
            : typeof firstBill.days_until_due === "number"
              ? `in ${firstBill.days_until_due} days`
              : "soon";
      items.push({
        key: "next_bill",
        title: `${firstBill.name} expected ${timing}`,
        detail: formatMoneyFromCents(firstBill.amount_cents, firstBill.currency),
        href: "/money/planned",
        priority: 100,
      });
    }

    if (otherBills.length > 0) {
      const names = otherBills.slice(0, 3).map((bill) => bill.name).join(", ");
      items.push({
        key: "other_bills",
        title: `${names} also coming up`,
        detail: "Expected over the next 30 days.",
        href: "/money/planned",
        priority: 90,
      });
    }

    if (summary.grocery_estimate_cents) {
      items.push({
        key: "groceries",
        title: "Groceries estimate",
        detail: `About ${formatMoneyFromCents(summary.grocery_estimate_cents, summary.currency)} over the next 30 days, based on recent spending.`,
        href: "/money/out",
        priority: 80,
      });
    }

    if (summary.primary_goal) {
      items.push({
        key: "goal",
        title: `${summary.primary_goal.title}: ${summary.primary_goal.progress_percent}%`,
        detail: `${formatMoneyFromCents(summary.primary_goal.current_cents, summary.primary_goal.currency)} saved toward ${formatMoneyFromCents(summary.primary_goal.target_cents, summary.primary_goal.currency)}.`,
        href: "/money/goals",
        priority: 70,
      });
    }

    const decisionItem = whatMattersNow.find((item) =>
      ["reviews_due", "reviews_soon", "open_decisions", "fresh_ask_promotion"].includes(item.key)
    );
    if (decisionItem) items.push(decisionItem);

    return items.sort((left, right) => right.priority - left.priority).slice(0, 4);
  }, [homeMoney, whatMattersNow]);

  const readyOverview = homeMoney.status === "ready" ? homeMoney.overview : null;
  const readyCoverage = readyOverview?.data_coverage ?? null;
  const homeHasMoney = readyCoverage ? hasVisibleMoney(readyCoverage) : false;
  const homeCurrency =
    readyCoverage?.current_month_money_in[0]?.currency ||
    readyCoverage?.current_month_money_out[0]?.currency ||
    "AUD";
  const homeSummary = readyOverview?.home_summary ?? null;
  const allocationCash = Math.max(0, homeSummary?.available_cash_cents ?? 0);
  const allocationPlanned = Math.min(
    allocationCash,
    Math.max(0, homeSummary?.planned_expenses_cents ?? 0)
  );
  const plannedPercent = allocationCash > 0
    ? Math.round((allocationPlanned / allocationCash) * 100)
    : 0;
  const flexiblePercent = allocationCash > 0 ? 100 - plannedPercent : 0;

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;
  const canType = authStatus === "signed_in";

  return (
    <Page title="Home" subtitle={subtitle}>
      <div className="mx-auto max-w-[760px] space-y-6">
        {!access.loading && access.isDemoMode && authStatus === "signed_in" ? (
          <Card className="border-zinc-200 bg-zinc-50 shadow-none">
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Welcome to the Life CFO demo</div>
                <div className="mt-1 text-sm leading-6 text-zinc-600">
                  This uses sample household data. You do not need to connect a bank.
                </div>
                <div className="text-sm leading-6 text-zinc-600">
                  Explore the money picture, ask questions, and try a decision.
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-zinc-200 bg-white shadow-none">
          <CardContent className="space-y-5">
            <div>
              <div className="text-base font-semibold text-zinc-900">Your money picture</div>
              {authStatus === "signed_out" ? (
                <div className="mt-2 text-sm text-zinc-600">Sign in to see your household picture.</div>
              ) : homeMoney.status === "idle" || homeMoney.status === "loading" ? (
                <div className="mt-2 text-sm text-zinc-600">Loading your household picture...</div>
              ) : homeMoney.status === "error" ? (
                <div className="mt-2 space-y-2">
                  <div className="text-sm text-zinc-600">{homeMoney.message}</div>
                  <Chip title="Try again" onClick={() => void runStatusCheck()}>
                    Try again
                  </Chip>
                </div>
              ) : homeHasMoney && homeSummary ? (
                <div className="mt-4 space-y-5">
                  <div className="rounded-3xl bg-zinc-50 px-5 py-5">
                    <div className="text-sm text-zinc-600">Likely breathing room</div>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
                      {formatMoneyFromCents(
                        homeSummary.likely_breathing_room_cents,
                        homeSummary.currency
                      )}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-zinc-600">
                      Estimate after bills expected over the next 30 days.
                    </div>
                    {homeSummary.likely_breathing_room_cents < 0 ? (
                      <div className="mt-2 text-sm text-zinc-700">
                        Worth a closer look. Expected bills are higher than visible cash.
                      </div>
                    ) : null}
                    <div className="mt-3 text-sm text-zinc-700">
                      Visible cash: {formatMoneyFromCents(homeSummary.available_cash_cents, homeSummary.currency)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-900">How this cash appears allocated</div>
                      <div className="mt-1 text-xs text-zinc-500">One way to look at the next 30 days.</div>
                    </div>
                    <div
                      className="flex h-3 overflow-hidden rounded-full bg-zinc-100"
                      role="img"
                      aria-label={`${plannedPercent}% expected bills and ${flexiblePercent}% flexible after known bills`}
                    >
                      <div className="bg-zinc-400" style={{ width: `${plannedPercent}%` }} />
                      <div className="bg-zinc-700" style={{ width: `${flexiblePercent}%` }} />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-zinc-800">Expected planned expenses</div>
                          <div className="text-xs text-zinc-500">
                            {homeSummary.planned_expenses_basis === "confirmed_patterns"
                              ? "Estimated from confirmed regular payments."
                              : homeSummary.planned_expenses_basis === "scheduled_bills"
                                ? "Based on bills and dates already in view."
                                : "No planned expenses are clear enough to include yet."}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium text-zinc-900">
                          {formatMoneyFromCents(homeSummary.planned_expenses_cents, homeSummary.currency)}
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4 border-t border-zinc-100 pt-2">
                        <div>
                          <div className="font-medium text-zinc-800">Likely breathing room</div>
                          <div className="text-xs text-zinc-500">Flexible after known bills.</div>
                        </div>
                        <div className="shrink-0 font-medium text-zinc-900">
                          {formatMoneyFromCents(homeSummary.likely_breathing_room_cents, homeSummary.currency)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 px-4 py-3">
                      <div className="text-sm font-medium text-zinc-900">Everyday estimate</div>
                      <div className="mt-1 text-base font-medium text-zinc-900">
                        {homeSummary.grocery_estimate_cents
                          ? formatMoneyFromCents(homeSummary.grocery_estimate_cents, homeSummary.currency)
                          : "Not clear yet"}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-zinc-500">
                        {homeSummary.grocery_estimate_cents
                          ? "Based on recent grocery spending. Tracked separately from breathing room."
                          : "Recent everyday spending is not clear enough to estimate."}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 px-4 py-3">
                      <div className="text-sm font-medium text-zinc-900">Goals and savings</div>
                      {homeSummary.primary_goal ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-zinc-800">{homeSummary.primary_goal.title}</span>
                            <span className="font-medium text-zinc-900">{homeSummary.primary_goal.progress_percent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className="h-full rounded-full bg-zinc-600"
                              style={{ width: `${homeSummary.primary_goal.progress_percent}%` }}
                            />
                          </div>
                          <div className="text-xs leading-5 text-zinc-500">
                            {formatMoneyFromCents(homeSummary.primary_goal.current_cents, homeSummary.primary_goal.currency)} of {formatMoneyFromCents(homeSummary.primary_goal.target_cents, homeSummary.primary_goal.currency)}. Tracked separately from visible cash.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs leading-5 text-zinc-500">
                          Goal tracking is ready when it would help.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="text-xs text-zinc-500">Money In</div>
                      <div className="mt-1 text-base font-medium text-zinc-900">
                        {formatMoneyFromCents(homeSummary.money_in_cents, homeSummary.currency)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">This month.</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="text-xs text-zinc-500">Upcoming bills</div>
                      <div className="mt-1 text-base font-medium text-zinc-900">
                        {homeSummary.upcoming_bills.length}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {homeSummary.upcoming_bills.length > 0
                          ? `${homeSummary.upcoming_bills.slice(0, 3).map((bill) => bill.name).join(", ")} coming up.`
                          : "No dated bills are visible."}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-600">
                  Your household money picture is not visible yet.
                </div>
              )}
            </div>

            {!access.loading && access.isDemoMode && authStatus === "signed_in" ? (
              <div className="text-xs text-zinc-500">This is sample data for exploring the app.</div>
            ) : null}

            {authStatus === "signed_in" ? (
              <div className="flex flex-wrap gap-2">
                <Chip title="Open Money" onClick={() => router.push("/money")}>
                  Open Money
                </Chip>
                <Chip title="Ask a question" onClick={() => continueInAsk()}>
                  Ask a question
                </Chip>
                <Chip title="Review decisions" onClick={() => router.push("/decisions?tab=active")}>
                  Review decisions
                </Chip>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-none">
          <CardContent className="space-y-3">
            <div className="text-base font-semibold text-zinc-900">Coming up</div>
            {authStatus === "signed_out" ? (
              <div className="text-sm text-zinc-600">Sign in to see what is coming up.</div>
            ) : comingUpItems.length === 0 ? (
              <div className="text-sm text-zinc-600">Nothing specific is coming up yet.</div>
            ) : (
              <div className="space-y-2">
                {comingUpItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="w-full rounded-2xl bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                  >
                    <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                    <div className="mt-1 text-xs text-zinc-600">{item.detail}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* TOP: Always-on CFO check-in memo */}
        <Card className={`hidden border-zinc-200 bg-white shadow-none ${readyOverview && !homeHasMoney ? "border-l-4 border-l-zinc-200" : ""}`}>
          <CardContent className="p-0">
            <div className="px-6 py-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                  <div className="flex items-center gap-2">
                    <Chip className="text-xs" title="How it works" onClick={() => router.push("/how-life-cfo-works")}>
                      How it works
                    </Chip>
                  </div>
                </div>

                {authStatus === "signed_out" ? (
                  <div className="text-sm text-zinc-700">Sign in to get a household check-in and ask a question.</div>
                ) : (
                  <>
                    {homeMoney.status === "idle" || homeMoney.status === "loading" ? (
                      <div className="space-y-2">
                        <div className="text-sm text-zinc-700">Checking in…</div>
                        <div className="text-xs text-zinc-500">This is a calm status snapshot. Nothing saves unless you choose.</div>
                      </div>
                    ) : homeMoney.status === "error" ? (
                      <div className="space-y-2">
                        <div className="text-sm text-zinc-700">{homeMoney.message}</div>
                        <div className="flex flex-wrap gap-2">
                          <Chip className="text-xs" title="Run check now" onClick={() => void runStatusCheck()}>
                            Run check now
                          </Chip>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-zinc-500">
                              <span className="font-medium text-zinc-600">Check-in</span> <span className="text-zinc-400">•</span>{" "}
                              <span>As of: {formatCheckedAt(homeMoney.overview.snapshot.asOf)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[15px] font-medium leading-relaxed text-zinc-900">
                            {homeHasMoney ? "Your household picture is visible." : "Needs more visibility."}
                          </div>
                          <div className="text-[15px] leading-relaxed text-zinc-800">
                            {homeHasMoney
                              ? visibleMoneySummary(homeMoney.overview.data_coverage)
                              : "Life CFO cannot yet see account balances or recent transactions for this household."}
                          </div>
                          {homeHasMoney ? (
                            <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700">
                              <li>Money in this month: {formatMoneyRows(homeMoney.overview.data_coverage.current_month_money_in)}.</li>
                              <li>Money out this month: {formatMoneyRows(homeMoney.overview.data_coverage.current_month_money_out)}.</li>
                              <li>Available cash: {formatMoneyFromCents(homeMoney.overview.snapshot.liquidity.availableCashCents, homeCurrency)}.</li>
                              <li>Source: {sourceNames(homeMoney.overview.data_coverage)}.</li>
                              {homeMoney.overview.data_coverage.confirmed_regular_payment_count > 0 ||
                              homeMoney.overview.data_coverage.confirmed_income_pattern_count > 0 ? (
                                <li>
                                  Confirmed patterns: {homeMoney.overview.data_coverage.confirmed_regular_payment_count} regular payment(s) and{" "}
                                  {homeMoney.overview.data_coverage.confirmed_income_pattern_count} income pattern(s).
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Chip className="text-xs" title="Check now" onClick={() => void runStatusCheck()}>
                            Check now
                          </Chip>

                          <Chip className="text-xs" title="Open Money" onClick={() => router.push("/money")}>
                            Open Money
                          </Chip>
                          <Chip className="text-xs" title="Open Decisions" onClick={() => router.push("/decisions?tab=active")}>
                            Open Decisions
                          </Chip>

                          {buildStamp ? <span className="ml-auto text-[11px] text-zinc-400">Build {buildStamp}</span> : null}
                        </div>

                        <div className="text-xs text-zinc-500">
                          One place. One question. One answer. <span className="text-zinc-400">Save only if you choose.</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {authStatus !== "signed_out" && buildStamp && homeMoney.status !== "ready" ? <div className="text-[11px] text-zinc-400">Build {buildStamp}</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What matters now */}
        <Card className="hidden border-zinc-200 bg-white shadow-none">
          <CardContent className="p-0">
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">What matters now</div>
                  <div className="text-xs text-zinc-500">Top priorities only, so this stays calm.</div>
                </div>
                <Chip className="text-xs" title="Refresh check-in" onClick={() => void runStatusCheck()}>
                  Refresh
                </Chip>
              </div>

              {authStatus === "signed_out" ? (
                <div className="text-sm text-zinc-700">Sign in to see your current priorities.</div>
              ) : whatMattersNow.length === 0 ? (
                <div className="text-sm text-zinc-700">Nothing urgent right now. You can check Money or continue a decision if you want.</div>
              ) : (
                <div className="space-y-2">
                  {whatMattersNow.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => router.push(item.href)}
                      className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-white"
                      title={item.title}
                    >
                      <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                      <div className="mt-1 text-xs text-zinc-600">{item.detail}</div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Chip className="text-xs" title="Open Money" onClick={() => router.push("/money")}>
                  Money
                </Chip>
                <Chip className="text-xs" title="Open Decisions" onClick={() => router.push("/decisions?tab=active")}>
                  Decisions
                </Chip>
                <Chip className="text-xs" title="Open Chapters" onClick={() => router.push("/chapters")}>
                  Chapters
                </Chip>
                <Chip
                  className="text-xs"
                  title={showQuickAsk ? "Hide quick ask" : "Think it through"}
                  onClick={() => {
                    setShowQuickAsk((v) => !v);
                    if (!showQuickAsk) focusInput();
                  }}
                >
                  {showQuickAsk ? "Hide quick ask" : "Think it through"}
                </Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Optional quick ask (secondary on Home) */}
        {showQuickAsk || ask.status !== "idle" ? (
          <Card className="border-zinc-200 bg-white shadow-none">
            <CardContent className="p-0">
              <div className="px-6 py-5">
                <div className="mb-2 text-xs text-zinc-500">Quick orientation on Home. Continue in Ask when you want to go deeper.</div>

                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ask Life CFO..."
                  className="w-full min-h-[120px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={!canType}
                  onKeyDown={(e) => {
                    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                    if (cmdOrCtrl && e.key === "Enter") {
                      e.preventDefault();
                      void submit();
                      return;
                    }

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />

                <div className="mt-2 flex justify-between text-xs text-zinc-500">
                  <span>Temporary by default. Save only if you choose.</span>
                  {ask.status === "loading" ? <span aria-live="polite">Thinking…</span> : <span className="h-4" aria-hidden="true" />}
                </div>

                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void submit()} disabled={!canType || !text.trim() || ask.status === "loading"} className="rounded-2xl">
                    Get answer
                  </Button>
                  <Chip className="text-xs" title="Clear" onClick={() => setText("")} disabled={!text.trim() || ask.status === "loading"}>
                    Clear
                  </Chip>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {["Are we okay this month?", "What changed recently?", "What is coming up for review?"].map((ex) => (
                    <Chip
                      key={ex}
                      className="text-xs"
                      title={ex}
                      disabled={!canType || ask.status === "loading"}
                      onClick={() => {
                        setShowQuickAsk(true);
                        setText(ex);
                      }}
                    >
                      {ex}
                    </Chip>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Q&A CFO Answer card */}
        {ask.status !== "idle" ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white shadow-none">
              <CardContent className="p-0">
                <div className="px-6 py-5">
                  {ask.status === "loading" ? (
                    <div className="text-sm text-zinc-700">Thinking…</div>
                  ) : ask.status === "error" ? (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                      <div className="text-sm text-zinc-700">{ask.message}</div>
                      <div className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-600">You asked:</span> {ask.question}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Chip className="text-xs" title="Try again" onClick={() => void askHome(ask.question)}>
                          Try again
                        </Chip>
                        <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                          Done
                        </Chip>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-zinc-900">Life CFO answer</div>
                          <div className="text-xs text-zinc-500">
                            <span className="font-medium text-zinc-600">Question:</span> {ask.question}
                          </div>
                        </div>

                        {memo ? (
                          <div className={"rounded-full px-3 py-1 text-xs font-medium " + tonePill(memo.tone).className}>{tonePill(memo.tone).label}</div>
                        ) : null}
                      </div>

                      {/* One-sentence headline */}
                      <div className="text-[16px] leading-relaxed text-zinc-900">
                        <span className="font-medium">{memo?.headline || ask.answer}</span>
                      </div>

                      {/* Key points */}
                      {memo ? (
                        <div className="space-y-2">
                          {memo.bullets.length > 0 ? (
                            <ul className="space-y-1">
                              {memo.bullets.slice(0, 3).map((b, idx) => (
                                <li key={idx} className="text-[14px] leading-relaxed text-zinc-800">
                                  <span className="text-zinc-400">• </span>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Controls */}
                      <div className="flex flex-wrap gap-2">
                        <Chip
                          className="text-xs"
                          title="Ask follow-up"
                          onClick={() => {
                            setFollowUpOpen(true);
                            scrollToFollowUp();
                            focusFollowUp();
                          }}
                        >
                          Ask follow-up
                        </Chip>

                        <Chip
                          className="text-xs"
                          title="Copy"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText((memo?.headline ? memo.headline + "\n\n" : "") + (ask.answer || ""));
                              toast({ title: "Copied", description: "Ready to paste." });
                            } catch {
                              toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
                            }
                          }}
                        >
                          Copy
                        </Chip>

                        {ask.actionHref ? (
                          <Chip className="text-xs" title="Open" onClick={() => router.push(ask.actionHref!)}>
                            Open details
                          </Chip>
                        ) : null}

                        <Chip className="text-xs" title="Continue in Ask" onClick={() => continueInAsk(ask.question)}>
                          Continue in Ask
                        </Chip>

                        <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                          Done
                        </Chip>
                      </div>

                      {/* Inline follow-up composer (keeps context visible) */}
                      <div ref={followUpRef}>
                        {followUpOpen ? (
                          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium text-zinc-700">Follow-up</div>
                              <Chip
                                className="text-xs"
                                title="Close"
                                onClick={() => {
                                  setFollowUpOpen(false);
                                  setFollowUpText("");
                                }}
                              >
                                Close
                              </Chip>
                            </div>

                            <textarea
                              ref={followUpInputRef}
                              value={followUpText}
                              onChange={(e) => setFollowUpText(e.target.value)}
                              placeholder="Ask a follow-up…"
                              className="mt-2 w-full min-h-[90px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
                              onKeyDown={(e) => {
                                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                                if (cmdOrCtrl && e.key === "Enter") {
                                  e.preventDefault();
                                  void submitFollowUp();
                                  return;
                                }

                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void submitFollowUp();
                                }
                              }}
                            />

                            <div className="mt-2 flex items-center justify-between">
                              <div className="text-xs text-zinc-500">This uses the current answer as context.</div>
                              <div className="flex gap-2">
                                <Chip className="text-xs" title="Clear" onClick={() => setFollowUpText("")} disabled={!followUpText.trim() || followUpSending}>
                                  Clear
                                </Chip>
                                <Button onClick={() => void submitFollowUp()} disabled={!followUpText.trim() || followUpSending} className="rounded-2xl">
                                  {followUpSending ? "Sending…" : "Send"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Optional depth */}
                      {memo ? (
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-wrap gap-2">
                            <Chip className="text-xs" title="Details" onClick={() => setShowDetails((v) => !v)}>
                              {showDetails ? "Hide details" : "Details"}
                            </Chip>
                            <Chip className="text-xs" title="What would change this?" onClick={() => setShowWhy((v) => !v)}>
                              {showWhy ? "Hide what would change this" : "What would change this?"}
                            </Chip>
                            <Chip className="text-xs" title="Assumptions" onClick={() => setShowAssumptions((v) => !v)}>
                              {showAssumptions ? "Hide assumptions" : "Assumptions"}
                            </Chip>
                          </div>

                          {showDetails ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                              <div className="text-xs font-medium text-zinc-700">Details</div>
                              <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">{memo.body ? memo.body : ask.answer}</div>
                            </div>
                          ) : null}

                          {showWhy ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                              <div className="text-xs font-medium text-zinc-700">What would change this</div>
                              <ul className="mt-2 space-y-1">
                                {calmWhatWouldChange(memo.tone).map((x) => (
                                  <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                    <span className="text-zinc-400">• </span>
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {showAssumptions ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                              <div className="text-xs font-medium text-zinc-700">Assumptions</div>
                              <ul className="mt-2 space-y-1">
                                {calmAssumptions().map((x) => (
                                  <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                    <span className="text-zinc-400">• </span>
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Permissioned save (post-answer, calm) */}
                      <div className="pt-2">
                        <div className="text-xs font-medium text-zinc-600">Promote this if it matters:</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Chip
                            className="text-xs"
                            title="Open in Money"
                            onClick={() => {
                              router.push("/money");
                            }}
                          >
                            Open in Money
                          </Chip>

                          <Chip
                            className="text-xs"
                            title="Open in Decisions"
                            onClick={() => {
                              router.push("/decisions?tab=active");
                            }}
                          >
                            Open in Decisions
                          </Chip>

                          <Chip
                            className="text-xs"
                            title="Leave it"
                            onClick={() => {
                              toast({ title: "Okay", description: "Nothing saved." });
                            }}
                          >
                            Leave it
                          </Chip>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
