"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

type RecurringBill = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_due_at: string;
  autopay: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type RecurringIncome = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_pay_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function formatMoneyFromCents(cents: number, currency = "AUD") {
  const value = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function sumCents(items: { amount_cents: number }[]) {
  return items.reduce((acc, x) => acc + (x.amount_cents || 0), 0);
}

type ComputedTotals = {
  balance: number;

  bills7: RecurringBill[];
  bills14: RecurringBill[];
  bills30: RecurringBill[];

  income7: RecurringIncome[];
  income14: RecurringIncome[];
  income30: RecurringIncome[];

  bills7Total: number;
  bills14Total: number;
  bills30Total: number;

  income7Total: number;
  income14Total: number;
  income30Total: number;

  safeToSpendWeek: number;
};

function computeTotals(accounts: Account[], bills: RecurringBill[], income: RecurringIncome[]): ComputedTotals {
  const activeBills = bills.filter((b) => b.active);
  const activeIncome = income.filter((i) => i.active);

  const balance = accounts.reduce((acc, a) => acc + (a.current_balance_cents || 0), 0);

  const now = new Date();
  const t7 = daysFromNow(7).getTime();
  const t14 = daysFromNow(14).getTime();
  const t30 = daysFromNow(30).getTime();

  const dueIn = (iso: string, toMs: number) => {
    const ms = new Date(iso).getTime();
    return ms >= now.getTime() && ms <= toMs;
  };

  const bills7 = activeBills.filter((b) => dueIn(b.next_due_at, t7));
  const bills14 = activeBills.filter((b) => dueIn(b.next_due_at, t14));
  const bills30 = activeBills.filter((b) => dueIn(b.next_due_at, t30));

  const income7 = activeIncome.filter((i) => dueIn(i.next_pay_at, t7));
  const income14 = activeIncome.filter((i) => dueIn(i.next_pay_at, t14));
  const income30 = activeIncome.filter((i) => dueIn(i.next_pay_at, t30));

  const bills7Total = sumCents(bills7);
  const bills14Total = sumCents(bills14);
  const bills30Total = sumCents(bills30);

  const income7Total = sumCents(income7);
  const income14Total = sumCents(income14);
  const income30Total = sumCents(income30);

  const safeToSpendWeek = Math.max(0, balance + income7Total - bills7Total);

  return {
    balance,
    bills7,
    bills14,
    bills30,
    income7,
    income14,
    income30,
    bills7Total,
    bills14Total,
    bills30Total,
    income7Total,
    income14Total,
    income30Total,
    safeToSpendWeek,
  };
}

type EngineInsight = {
  key: string;
  title: string;
  body: string;
  severity: 1 | 2 | 3;
};

// -------------------- Helper bodies + severities (MODULE SCOPE) --------------------
const INSIGHTS_DEDUPE_KEY = "engine_insights_v2_digest";
const REVIEW_DUE_SOON_HOURS = 48;

function buildUpcomingBillsBody(t: ComputedTotals) {
  if (t.bills14.length === 0) {
    return [
      "No bills due in the next 14 days.",
      "",
      `Balance: ${formatMoneyFromCents(t.balance)}`,
      `Bills (7d): ${formatMoneyFromCents(t.bills7Total)}`,
      `Bills (14d): ${formatMoneyFromCents(t.bills14Total)}`,
      `Bills (30d): ${formatMoneyFromCents(t.bills30Total)}`,
    ].join("\n");
  }

  const lines = t.bills14.map((b) => {
    const flags = [b.autopay ? "autopay" : null].filter(Boolean).join(", ");
    const flagText = flags ? ` (${flags})` : "";
    return `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}${flagText}`;
  });

  return [
    `Bills due in the next 14 days (${t.bills14.length}):`,
    ...lines,
    "",
    `Total (14d): ${formatMoneyFromCents(t.bills14Total)}`,
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
  ].join("\n");
}

function buildUpcomingIncomeBody(t: ComputedTotals) {
  if (t.income14.length === 0) {
    return [
      "No income due in the next 14 days.",
      "",
      `Balance: ${formatMoneyFromCents(t.balance)}`,
      `Income (7d): ${formatMoneyFromCents(t.income7Total)}`,
      `Income (14d): ${formatMoneyFromCents(t.income14Total)}`,
      `Income (30d): ${formatMoneyFromCents(t.income30Total)}`,
    ].join("\n");
  }

  const lines = t.income14.map((i) => {
    return `• ${i.name}: ${formatMoneyFromCents(i.amount_cents, i.currency)} — next pay ${fmtDateTime(i.next_pay_at)}`;
  });

  return [
    `Income due in the next 14 days (${t.income14.length}):`,
    ...lines,
    "",
    `Total (14d): ${formatMoneyFromCents(t.income14Total)}`,
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
  ].join("\n");
}

function severityForSafeToSpend(t: ComputedTotals) {
  const dollars = t.safeToSpendWeek / 100;
  if (dollars <= 0) return 3;
  if (dollars < 200) return 2;
  return 1;
}

function severityForUpcomingBills(t: ComputedTotals) {
  if (t.bills14Total > t.balance) return 3;
  if (t.bills14Total > 0) return 2;
  return 1;
}

function severityForUpcomingIncome(t: ComputedTotals) {
  if (t.income14Total > 0) return 1;
  return 2;
}

function buildCashflow30Body(t: ComputedTotals) {
  const outlook = t.balance + t.income30Total - t.bills30Total;

  return [
    "30-day cashflow outlook (truth-based):",
    "",
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
    `Income due (30d): ${formatMoneyFromCents(t.income30Total)}`,
    `Bills due (30d): ${formatMoneyFromCents(t.bills30Total)}`,
    "",
    `Outlook (30d): ${formatMoneyFromCents(outlook)}`,
    "",
    "Truth reminder:",
    "outlook_30d = balance + income_due_30d - bills_due_30d",
  ].join("\n");
}

function severityForCashflow30(t: ComputedTotals) {
  const outlook = t.balance + t.income30Total - t.bills30Total;
  if (outlook < 0) return 3;
  if (outlook < 200_00) return 2;
  return 1;
}

function buildLargestBill14dBody(t: ComputedTotals) {
  if (t.bills14.length === 0) {
    return ["No bills due in the next 14 days.", "", `Balance: ${formatMoneyFromCents(t.balance)}`].join("\n");
  }

  const largest = [...t.bills14].sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0))[0];

  return [
    "Largest upcoming bill (next 14 days):",
    "",
    `• ${largest.name}: ${formatMoneyFromCents(largest.amount_cents, largest.currency)} — due ${fmtDateTime(
      largest.next_due_at
    )}${largest.autopay ? " (autopay)" : " (NOT autopay)"}`,
    "",
    `Bills due (14d): ${formatMoneyFromCents(t.bills14Total)}`,
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
  ].join("\n");
}

function severityForLargestBill14d(t: ComputedTotals) {
  if (t.bills14.length === 0) return 1;
  const largest = t.bills14.reduce((max, b) => Math.max(max, b.amount_cents || 0), 0);
  if (largest > t.balance) return 3;
  if (largest > 300_00) return 2;
  return 1;
}

function buildAutopayRiskBody(t: ComputedTotals) {
  const due7NoAutopay = t.bills7.filter((b) => !b.autopay);
  if (due7NoAutopay.length === 0) {
    return [
      "No near-term autopay risks.",
      "",
      "All bills due in the next 7 days are marked autopay (or there are no bills due).",
    ].join("\n");
  }

  const lines = due7NoAutopay.map(
    (b) => `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}`
  );

  return [
    `Autopay risk: ${due7NoAutopay.length} bill(s) due in 7 days are NOT autopay:`,
    ...lines,
    "",
    "Next step:",
    "Either enable autopay or set a manual reminder.",
  ].join("\n");
}

function severityForAutopayRisk(t: ComputedTotals) {
  const due7NoAutopay = t.bills7.filter((b) => !b.autopay);
  if (due7NoAutopay.length === 0) return 1;
  if (due7NoAutopay.length >= 3) return 3;
  return 2;
}
// -------------------- End helpers --------------------

type LiveStatus = "connecting" | "live" | "offline";

type EngineSignals = {
  inboxOpen: number;
  reviewsDue: number;
};

function sortByCreatedAtAsc<T extends { created_at?: string }>(rows: T[]) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    const va = Number.isNaN(ta) ? 0 : ta;
    const vb = Number.isNaN(tb) ? 0 : tb;
    return va - vb;
  });
  return copy;
}

function sortBills(rows: RecurringBill[]) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const ta = a.next_due_at ? Date.parse(a.next_due_at) : 0;
    const tb = b.next_due_at ? Date.parse(b.next_due_at) : 0;
    const va = Number.isNaN(ta) ? 0 : ta;
    const vb = Number.isNaN(tb) ? 0 : tb;
    return va - vb;
  });
  return copy;
}

function sortIncome(rows: RecurringIncome[]) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const ta = a.next_pay_at ? Date.parse(a.next_pay_at) : 0;
    const tb = b.next_pay_at ? Date.parse(b.next_pay_at) : 0;
    const va = Number.isNaN(ta) ? 0 : ta;
    const vb = Number.isNaN(tb) ? 0 : tb;
    return va - vb;
  });
  return copy;
}

// -------------------- cadence bump helpers (MODULE SCOPE) --------------------
function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

function addMonthsPreserveDay(date: Date, months: number) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  const target = new Date(date);
  target.setDate(1);
  target.setMonth(m + months);

  const ty = target.getFullYear();
  const tm = target.getMonth();
  const maxDay = daysInMonth(ty, tm);
  target.setDate(Math.min(d, maxDay));

  return target;
}

function bumpIsoByCadence(currentIso: string, cadence: Cadence) {
  const d = new Date(currentIso);
  if (Number.isNaN(d.getTime())) return currentIso;

  let next = new Date(d);

  if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "fortnightly") next.setDate(next.getDate() + 14);
  else if (cadence === "monthly") next = addMonthsPreserveDay(next, 1);
  else if (cadence === "yearly") next = addMonthsPreserveDay(next, 12);

  return next.toISOString();
}
// -------------------- End cadence bump helpers --------------------

export default function EnginePage() {
  const { showToast } = useToast();

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [income, setIncome] = useState<RecurringIncome[]>([]);

  const [signals, setSignals] = useState<EngineSignals>({ inboxOpen: 0, reviewsDue: 0 });
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [lastRanAt, setLastRanAt] = useState<string | null>(null);

  const COOLDOWN_MS = 10_000;
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const [markingPaid, setMarkingPaid] = useState<Record<string, boolean>>({});

  const reloadTimerRef = useRef<number | null>(null);
  const loadAllRef = useRef<(uid: string, opts?: { silent?: boolean }) => Promise<any>>(async () => ({}));
  const loadSignalsRef = useRef<(uid: string, opts?: { silent?: boolean }) => Promise<void>>(async () => {});

  const scheduleReload = (fn: () => void) => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => fn(), 250);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        setError("Not signed in.");
        setLoading(false);
        setLiveStatus("offline");
        return;
      }

      setUserId(data.user.id);
      await loadAll(data.user.id);
      await loadSignals(data.user.id, { silent: true });
      setLoading(false);
    })();

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) setError(null);

    const [aRes, bRes, iRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      supabase
        .from("recurring_bills")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_due_at", { ascending: true }),
      supabase
        .from("recurring_income")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_pay_at", { ascending: true }),
    ]);

    if (aRes.error) setError(aRes.error.message);
    if (bRes.error) setError(bRes.error.message);
    if (iRes.error) setError(iRes.error.message);

    const a = (aRes.data || []) as Account[];
    const b = (bRes.data || []) as RecurringBill[];
    const i = (iRes.data || []) as RecurringIncome[];

    setAccounts(a);
    setBills(b);
    setIncome(i);

    return { accounts: a, bills: b, income: i };
  }

  async function loadSignals(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    try {
      const inboxCountRes = await supabase
        .from("decision_inbox")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .neq("status", "done");

      const thresholdIso = new Date(Date.now() + REVIEW_DUE_SOON_HOURS * 60 * 60 * 1000).toISOString();

      const reviewsCountRes = await supabase
        .from("decisions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "decided")
        .not("review_at", "is", null)
        .lte("review_at", thresholdIso);

      const inboxOpen = inboxCountRes.count ?? signals.inboxOpen;
      const reviewsDue = reviewsCountRes.count ?? signals.reviewsDue;

      setSignals({ inboxOpen, reviewsDue });
    } catch (e) {
      if (!silent) {
        // signals are optional
      }
    }
  }

  useEffect(() => {
    loadAllRef.current = (uid: string, opts?: { silent?: boolean }) => loadAll(uid, opts);
    loadSignalsRef.current = (uid: string, opts?: { silent?: boolean }) => loadSignals(uid, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, signals.inboxOpen, signals.reviewsDue]);

  useEffect(() => {
    if (!userId) return;

    setLiveStatus("connecting");

    const patchAccounts = (payload: any) => {
      const eventType: string | undefined = payload?.eventType;
      const newRow = payload?.new as Account | undefined;
      const oldRow = payload?.old as Partial<Account> | undefined;
      const id = (newRow as any)?.id || (oldRow as any)?.id;

      if (!eventType || !id) {
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return;
      }

      setAccounts((prev) => {
        if (eventType === "INSERT") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const exists = prev.some((x) => x.id === newRow.id);
          const merged = exists ? prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x)) : [...prev, newRow];
          return sortByCreatedAtAsc(merged);
        }
        if (eventType === "UPDATE") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const merged = prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x));
          return sortByCreatedAtAsc(merged);
        }
        if (eventType === "DELETE") return prev.filter((x) => x.id !== id);
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return prev;
      });
    };

    const patchBills = (payload: any) => {
      const eventType: string | undefined = payload?.eventType;
      const newRow = payload?.new as RecurringBill | undefined;
      const oldRow = payload?.old as Partial<RecurringBill> | undefined;
      const id = (newRow as any)?.id || (oldRow as any)?.id;

      if (!eventType || !id) {
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return;
      }

      setBills((prev) => {
        if (eventType === "INSERT") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const exists = prev.some((x) => x.id === newRow.id);
          const merged = exists ? prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x)) : [...prev, newRow];
          return sortBills(merged);
        }
        if (eventType === "UPDATE") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const merged = prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x));
          return sortBills(merged);
        }
        if (eventType === "DELETE") return prev.filter((x) => x.id !== id);
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return prev;
      });
    };

    const patchIncome = (payload: any) => {
      const eventType: string | undefined = payload?.eventType;
      const newRow = payload?.new as RecurringIncome | undefined;
      const oldRow = payload?.old as Partial<RecurringIncome> | undefined;
      const id = (newRow as any)?.id || (oldRow as any)?.id;

      if (!eventType || !id) {
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return;
      }

      setIncome((prev) => {
        if (eventType === "INSERT") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const exists = prev.some((x) => x.id === newRow.id);
          const merged = exists ? prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x)) : [...prev, newRow];
          return sortIncome(merged);
        }
        if (eventType === "UPDATE") {
          if (!newRow) {
            scheduleReload(() => loadAllRef.current(userId, { silent: true }));
            return prev;
          }
          const merged = prev.map((x) => (x.id === newRow.id ? { ...x, ...newRow } : x));
          return sortIncome(merged);
        }
        if (eventType === "DELETE") return prev.filter((x) => x.id !== id);
        scheduleReload(() => loadAllRef.current(userId, { silent: true }));
        return prev;
      });
    };

    const bumpSignals = () => scheduleReload(() => loadSignalsRef.current(userId, { silent: true }));

    const channel = supabase
      .channel(`engine-realtime-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` }, (p) => {
        patchAccounts(p);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_bills", filter: `user_id=eq.${userId}` },
        (p) => {
          patchBills(p);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_income", filter: `user_id=eq.${userId}` },
        (p) => {
          patchIncome(p);
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "decision_inbox", filter: `user_id=eq.${userId}` }, () =>
        bumpSignals()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, () =>
        bumpSignals()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setLiveStatus("offline");
      });

    return () => {
      supabase.removeChannel(channel);
      setLiveStatus("offline");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const onFocus = () => {
      if (!userId) return;
      loadAllRef.current(userId, { silent: true });
      loadSignalsRef.current(userId, { silent: true });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [userId]);

  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);
  const activeIncome = useMemo(() => income.filter((i) => i.active), [income]);

  const totals = useMemo(() => computeTotals(accounts, bills, income), [accounts, bills, income]);

  const dueSoonBills7 = useMemo(() => {
    const copy = [...totals.bills7];
    copy.sort((a, b) => {
      const ta = a.next_due_at ? Date.parse(a.next_due_at) : 0;
      const tb = b.next_due_at ? Date.parse(b.next_due_at) : 0;
      return ta - tb;
    });
    return copy;
  }, [totals.bills7]);

  async function markBillPaid(b: RecurringBill) {
    if (!userId) return;
    if (markingPaid[b.id]) return;

    setMarkingPaid((prev) => ({ ...prev, [b.id]: true }));

    const prevDue = b.next_due_at;
    const nextDue = bumpIsoByCadence(b.next_due_at, b.cadence);

    // optimistic bump (Engine view)
    setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: nextDue } : x)));

    try {
      // 1) receipt
      const { data: paymentRow, error: payErr } = await supabase
        .from("bill_payments")
        .insert({
          user_id: userId,
          bill_id: b.id,
          paid_at: new Date().toISOString(),
          amount_cents: b.amount_cents ?? 0,
          currency: b.currency ?? "AUD",
          note: "Paid via Engine",
          source: "engine",
        })
        .select("id")
        .single();

      if (payErr) throw payErr;

      const paymentId = (paymentRow as any)?.id as string | undefined;
      if (!paymentId) throw new Error("Receipt inserted but missing id (unexpected).");

      // 2) bump due date
      const { error: upErr } = await supabase
        .from("recurring_bills")
        .update({ next_due_at: nextDue })
        .eq("id", b.id)
        .eq("user_id", userId);

      if (upErr) {
        await supabase.from("bill_payments").delete().eq("id", paymentId).eq("user_id", userId);
        throw upErr;
      }

      showToast({
        message: `"${b.name}" marked paid ✅`,
        undoLabel: "Undo",
        onUndo: async () => {
          // optimistic revert
          setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: prevDue } : x)));

          const { error: dueErr } = await supabase
            .from("recurring_bills")
            .update({ next_due_at: prevDue })
            .eq("id", b.id)
            .eq("user_id", userId);

          const { error: delErr } = await supabase.from("bill_payments").delete().eq("id", paymentId).eq("user_id", userId);

          if (dueErr || delErr) {
            await loadAllRef.current(userId, { silent: true });
            showToast({ message: (dueErr?.message || delErr?.message || "Undo failed") as string });
            return;
          }

          showToast({ message: "Undone ✅" });
        },
      });

      scheduleReload(() => loadAllRef.current(userId, { silent: true }));
    } catch (e: any) {
      setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: prevDue } : x)));
      notify({ title: "Mark paid failed", description: e?.message ?? "Couldn’t update / write receipt." });
      scheduleReload(() => loadAllRef.current(userId, { silent: true }));
    } finally {
      setMarkingPaid((prev) => ({ ...prev, [b.id]: false }));
    }
  }

  async function writeSingleReminder(opts: { runId: string; dedupe_key: string; title: string; body: string; severity: number }) {
    if (!userId) return;

    const { error: upErr } = await supabase.from("decision_inbox").upsert(
      [
        {
          user_id: userId,
          run_id: opts.runId,
          type: "engine",
          title: opts.title,
          body: opts.body,
          severity: opts.severity,
          status: "open",
          snoozed_until: null,
          dedupe_key: opts.dedupe_key,
        },
      ],
      { onConflict: "user_id,dedupe_key" }
    );

    if (upErr) throw upErr;
  }

  async function upsertInsights(runId: string, insights: EngineInsight[]) {
    if (!userId) return;

    const payload = insights.map((x) => ({
      user_id: userId,
      run_id: runId,
      type: "engine",
      title: x.title,
      body: x.body,
      severity: x.severity,
      status: "open",
      snoozed_until: null,
      dedupe_key: x.key,
    }));

    const { error: upErr } = await supabase.from("decision_inbox").upsert(payload, { onConflict: "user_id,dedupe_key" });

    if (upErr) throw upErr;
  }

  const isInsightsDigest = (key: string) => key === INSIGHTS_DEDUPE_KEY;

  function computeInsights(t: ComputedTotals, freshBills: RecurringBill[], freshIncome: RecurringIncome[], freshAccounts: Account[]) {
    const list: EngineInsight[] = [];

    if (freshAccounts.length === 0) {
      list.push({
        key: "engine_v2_missing_accounts",
        title: "Insight: Add accounts to compute safe-to-spend",
        severity: 2,
        body: ["Keystone can’t compute safe-to-spend yet because there are no accounts.", "", "Next step:", "Go to Accounts and add at least one account balance."].join(
          "\n"
        ),
      });
      return list;
    }

    if (freshBills.length === 0) {
      list.push({
        key: "engine_v2_missing_bills",
        title: "Insight: Add bills so reminders are real",
        severity: 2,
        body: [
          "Keystone can’t warn you about upcoming obligations yet because there are no bills.",
          "",
          "Next step:",
          "Go to Bills and add recurring obligations (rent, internet, insurance…).",
        ].join("\n"),
      });
    }

    if (freshIncome.length === 0) {
      list.push({
        key: "engine_v2_missing_income",
        title: "Insight: Add income so safe-to-spend is truthful",
        severity: 2,
        body: [
          "Keystone can’t include income in safe-to-spend yet because there is no recurring income.",
          "",
          "Next step:",
          "Go to Income and add your recurring pay / benefits / transfers (if applicable).",
        ].join("\n"),
      });
    }

    const safeDollars = t.safeToSpendWeek / 100;
    if (safeDollars <= 0) {
      list.push({
        key: "engine_v2_safe_to_spend_zero",
        title: "Insight: Safe-to-spend is $0 this week",
        severity: 1,
        body: [
          `Balance now: ${formatMoneyFromCents(t.balance)}`,
          `Income due (7d): ${formatMoneyFromCents(t.income7Total)}`,
          `Bills due (7d): ${formatMoneyFromCents(t.bills7Total)}`,
          "",
          `Safe-to-spend (7d): ${formatMoneyFromCents(t.safeToSpendWeek)}`,
          "",
          "Truth reminder:",
          "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
        ].join("\n"),
      });
    } else if (safeDollars < 200) {
      list.push({
        key: "engine_v2_safe_to_spend_low",
        title: "Insight: Safe-to-spend is low this week",
        severity: 2,
        body: [
          `Safe-to-spend (7d): ${formatMoneyFromCents(t.safeToSpendWeek)}`,
          "",
          "This is not a forecast — it’s just what’s currently true based on your inputs.",
        ].join("\n"),
      });
    }

    if (t.bills14Total > t.balance) {
      list.push({
        key: "engine_v2_bills_exceed_balance_14d",
        title: "Insight: Bills due in 14 days exceed balance",
        severity: 1,
        body: [
          `Balance now: ${formatMoneyFromCents(t.balance)}`,
          `Bills due (14d): ${formatMoneyFromCents(t.bills14Total)}`,
          "",
          "Bills list:",
          ...t.bills14.map((b) => `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}`),
        ].join("\n"),
      });
    }

    const soonManual = t.bills7.filter((b) => !b.autopay);
    if (soonManual.length > 0) {
      const b = soonManual[0];
      list.push({
        key: "engine_v2_autopay_off_bill_due_soon",
        title: "Insight: A bill is due soon and autopay is OFF",
        severity: 2,
        body: [
          `Bill: ${b.name}`,
          `Amount: ${formatMoneyFromCents(b.amount_cents, b.currency)}`,
          `Due: ${fmtDateTime(b.next_due_at)}`,
          "",
          "If this is meant to be manual, ignore.",
          "If it should be autopay, flip it on in Bills so Engine can relax.",
        ].join("\n"),
      });
    }

    if (list.length > 0 && !list.some((x) => isInsightsDigest(x.key))) {
      list.unshift({
        key: INSIGHTS_DEDUPE_KEY,
        title: "Insights digest",
        severity: 2,
        body: ["You have new Engine insights.", "", "Next step:", "Open Inbox → Insights section and clear as you act."].join("\n"),
      });
    }

    return list;
  }

  async function runEngineV1() {
    if (!userId) return;

    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - now) / 1000);
      notify({ title: "Please wait", description: `Engine cooldown: ${secs}s` });
      return;
    }

    setRunning(true);
    setCooldownUntil(now + COOLDOWN_MS);

    try {
      const fresh = await loadAll(userId);
      const freshTotals = computeTotals(fresh.accounts, fresh.bills, fresh.income);

      const runId = crypto.randomUUID();

      if (fresh.bills.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_bills",
          title: "Add bills so Keystone can remind you",
          severity: 2,
          body: [
            "Keystone can’t remind you about upcoming bills yet because there are no bills.",
            "",
            "Next step:",
            "Go to Bills and add your recurring obligations (rent, internet, insurance…).",
          ].join("\n"),
        });
      }

      if (fresh.income.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_income",
          title: "Add income so safe-to-spend can be truthful",
          severity: 2,
          body: [
            "Keystone can’t include income in safe-to-spend yet because there is no recurring income.",
            "",
            "Next step:",
            "Go to Income and add your recurring pay / benefits / transfers (if applicable).",
          ].join("\n"),
        });
      }

      if (fresh.accounts.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_accounts",
          title: "Add accounts to compute safe-to-spend",
          severity: 1,
          body: [
            "Keystone can’t compute safe-to-spend yet because there are no accounts.",
            "",
            "Truth reminder:",
            "Safe-to-spend is based on your account balances + income due - bills due.",
            "",
            "Next step:",
            "Go to Accounts and add at least one account balance.",
          ].join("\n"),
        });

        setLastRanAt(new Date().toLocaleString());
        notify({ title: "Engine v1 ran", description: "Missing accounts reminder written to Inbox." });
        return;
      }

      await supabase.from("decision_inbox").update({ status: "done", snoozed_until: null }).eq("user_id", userId).eq("dedupe_key", "engine_missing_accounts");

      const safeTitle = "Safe to spend this week";
      const billsTitle = "Upcoming bills (next 14 days)";
      const incomeTitle = "Upcoming income (next 14 days)";

      const safeBody = [
        `Balance now: ${formatMoneyFromCents(freshTotals.balance)}`,
        `Income (7d): ${formatMoneyFromCents(freshTotals.income7Total)}`,
        `Bills (7d): ${formatMoneyFromCents(freshTotals.bills7Total)}`,
        "",
        `Safe-to-spend (7d): ${formatMoneyFromCents(freshTotals.safeToSpendWeek)}`,
        "",
        "Truth reminder:",
        "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
      ].join("\n");

      const billsBody = buildUpcomingBillsBody(freshTotals);
      const incomeBody = buildUpcomingIncomeBody(freshTotals);

      const upsertRows: any[] = [
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: safeTitle,
          body: safeBody,
          severity: severityForSafeToSpend(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_safe_to_spend_week",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: billsTitle,
          body: billsBody,
          severity: severityForUpcomingBills(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_bills_14d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: incomeTitle,
          body: incomeBody,
          severity: severityForUpcomingIncome(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_income_14d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "30-day cashflow outlook",
          body: buildCashflow30Body(freshTotals),
          severity: severityForCashflow30(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_cashflow_outlook_30d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "Largest bill (next 14 days)",
          body: buildLargestBill14dBody(freshTotals),
          severity: severityForLargestBill14d(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_largest_bill_14d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "Autopay risks (next 7 days)",
          body: buildAutopayRiskBody(freshTotals),
          severity: severityForAutopayRisk(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_autopay_risk_7d",
        },
      ];

      const { error: upErr } = await supabase.from("decision_inbox").upsert(upsertRows, { onConflict: "user_id,dedupe_key" });
      if (upErr) throw upErr;

      await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("user_id", userId)
        .in("dedupe_key", ["engine_missing_bills", "engine_missing_income"]);

      setLastRanAt(new Date().toLocaleString());
      notify({ title: "Engine v1 ran", description: "Wrote baseline reminders into Inbox (dedupe-safe)." });

      loadSignalsRef.current(userId, { silent: true });
    } catch (e: any) {
      notify({ title: "Engine error", description: e?.message ?? "Failed to run engine." });
    } finally {
      setRunning(false);
    }
  }

  async function runEngineV2() {
    if (!userId) return;

    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - now) / 1000);
      notify({ title: "Please wait", description: `Engine cooldown: ${secs}s` });
      return;
    }

    setRunning(true);
    setCooldownUntil(now + COOLDOWN_MS);

    try {
      const fresh = await loadAll(userId);
      const freshTotals = computeTotals(fresh.accounts, fresh.bills, fresh.income);
      const runId = crypto.randomUUID();

      const insights = computeInsights(freshTotals, fresh.bills, fresh.income, fresh.accounts);

      if (insights.length === 0) {
        setLastRanAt(new Date().toLocaleString());
        notify({ title: "Engine v2 ran", description: "No new insights (nice!)." });
        return;
      }

      await upsertInsights(runId, insights);

      setLastRanAt(new Date().toLocaleString());
      notify({ title: "Engine v2 ran", description: `Wrote ${insights.length} insight(s) into Inbox (deduped).` });

      loadSignalsRef.current(userId, { silent: true });
    } catch (e: any) {
      notify({ title: "Engine v2 error", description: e?.message ?? "Failed to run Engine v2." });
    } finally {
      setRunning(false);
    }
  }

  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  const insightsPreview = useMemo(() => {
    const list = computeInsights(totals, bills, income, accounts);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, bills, income, accounts]);

  const liveBadge = () => {
    if (liveStatus === "live") return { text: "Live", variant: "success" as const };
    if (liveStatus === "connecting") return { text: "Connecting…", variant: "warning" as const };
    return { text: "Offline", variant: "danger" as const };
  };

  const badge = liveBadge();

  return (
    <Page title="Engine" subtitle="Manual simulation harness. Engine reads your truths and writes reminders/insights to Inbox.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={badge.variant}>● {badge.text}</Badge>
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {error ? <Chip>{error}</Chip> : null}
                {lastRanAt ? <Chip>Last ran: {lastRanAt}</Chip> : <Chip>Last ran: —</Chip>}
                {cooldownSeconds > 0 ? <Chip>Cooldown: {cooldownSeconds}s</Chip> : null}

                <Chip>Inbox open: {signals.inboxOpen}</Chip>
                <Chip>Reviews due ≤{REVIEW_DUE_SOON_HOURS}h: {signals.reviewsDue}</Chip>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => userId && loadAllRef.current(userId, { silent: true })} disabled={!userId || loading || running}>
                  Refresh inputs
                </Button>

                <Button
                  onClick={() => userId && loadSignalsRef.current(userId, { silent: true })}
                  disabled={!userId || loading || running}
                  variant="secondary"
                >
                  Refresh signals
                </Button>

                <Button onClick={runEngineV1} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v1 (Baseline)"}
                </Button>

                <Button variant="secondary" onClick={runEngineV2} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v2 (Insights)"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Inputs</div>
            <div className="flex flex-wrap gap-2">
              <Badge>Accounts: {accounts.length}</Badge>
              <Badge>Bills (active): {activeBills.length}</Badge>
              <Badge>Income (active): {activeIncome.length}</Badge>
              <Chip>Balance: {formatMoneyFromCents(totals.balance)}</Chip>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Engine v2 insights (preview)</div>

            {insightsPreview.length === 0 ? (
              <div className="text-sm text-zinc-600">No insights right now — looks calm ✅</div>
            ) : (
              <div className="grid gap-2">
                {insightsPreview.map((x) => (
                  <div key={x.key} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{x.title}</div>
                      <div className="text-xs text-zinc-500">severity {x.severity}</div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{x.body}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-sm opacity-70 mt-3">
              Preview is computed locally from current inputs. Clicking “Run Engine v2 (Insights)” writes these as deduped Inbox items.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Obligations snapshot</div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 7 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills7Total)} ({totals.bills7.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income7Total)} ({totals.income7.length})
                </div>
                <div className="text-sm opacity-75 mt-2">
                  Safe-to-spend: <span className="font-semibold">{formatMoneyFromCents(totals.safeToSpendWeek)}</span>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 14 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills14Total)} ({totals.bills14.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income14Total)} ({totals.income14.length})
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 30 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills30Total)} ({totals.bills30.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income30Total)} ({totals.income30.length})
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-semibold">Bills due soon (next 7 days)</div>
                <div className="text-sm opacity-70">“Mark paid” writes a receipt + bumps next due by cadence.</div>
              </div>

              {dueSoonBills7.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-600">No bills due in the next 7 days.</div>
              ) : (
                <div className="mt-2 grid gap-2">
                  {dueSoonBills7.slice(0, 6).map((b) => {
                    const busy = !!markingPaid[b.id];
                    return (
                      <div key={b.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-[240px] flex-1">
                          <div className="font-semibold flex items-center gap-2 flex-wrap">
                            {b.name}
                            {b.autopay ? <Chip>Autopay</Chip> : <Chip>Manual</Chip>}
                            <Chip>{b.cadence}</Chip>
                          </div>
                          <div className="text-sm text-zinc-600 mt-1">
                            {formatMoneyFromCents(b.amount_cents, b.currency)} • Due {fmtDateTime(b.next_due_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button onClick={() => markBillPaid(b)} disabled={!userId || busy}>
                            {busy ? "Updating…" : "Mark paid"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-sm opacity-70 mt-3">
              Engine v1 writes baseline reminders. Engine v2 writes higher-signal insights. Cooldown prevents spam runs.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
