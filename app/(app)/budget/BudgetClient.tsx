// app/(app)/budget/BudgetClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
type BudgetKind = "expense" | "saving" | "sinking";

type BudgetItem = {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  kind: BudgetKind;
  amount_cents: number;
  cadence: Cadence;
  active: boolean;
  sort_order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AccountsRow = { current_balance_cents: number | null; archived?: boolean | null };
type IncomeRow = { amount_cents: number | null; cadence: string | null; active: boolean | null };
type BillsRow = { amount_cents: number | null; cadence: string | null; active: boolean | null };

type LiveState = "connecting" | "live" | "offline";

function safeNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cents(n: number) {
  return Math.round(n);
}

function formatMoneyFromCents(c: number, currency = "AUD") {
  const value = (c || 0) / 100;
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

function normalizeCadence(raw?: string | null): Cadence {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s.includes("fort")) return "fortnightly";
  if (s.includes("week")) return "weekly";
  if (s.includes("quarter")) return "quarterly";
  if (s.includes("year") || s.includes("annual")) return "yearly";
  return "monthly";
}

function monthlyFactor(c: Cadence) {
  if (c === "weekly") return 52 / 12;
  if (c === "fortnightly") return 26 / 12;
  if (c === "monthly") return 1;
  if (c === "quarterly") return 1 / 3;
  if (c === "yearly") return 1 / 12;
  return 1;
}

function monthlyEstimate(amountCents: number, cadenceRaw?: string | null) {
  const cadence = normalizeCadence(cadenceRaw);
  return cents(amountCents * monthlyFactor(cadence));
}

function centsFromInput(input: string): number {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;

  const parts = cleaned.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").slice(0, 2);
  const fracPadded = (frac + "00").slice(0, 2);

  const c = parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
  return Number.isFinite(c) ? c : 0;
}

function labelKind(k: BudgetKind) {
  if (k === "expense") return "Spending";
  if (k === "saving") return "Saving";
  return "Sinking fund";
}

type Starter = {
  label: string;
  name: string;
  kind: BudgetKind;
  cadence: Cadence;
  amount_hint?: string;
};

const STARTERS: Starter[] = [
  { label: "Groceries", name: "Groceries", kind: "expense", cadence: "weekly", amount_hint: "e.g. 250" },
  { label: "Fuel / Transport", name: "Fuel / Transport", kind: "expense", cadence: "weekly", amount_hint: "e.g. 120" },
  { label: "Eating out", name: "Eating out", kind: "expense", cadence: "monthly", amount_hint: "e.g. 150" },
  { label: "Kids", name: "Kids", kind: "expense", cadence: "monthly", amount_hint: "e.g. 200" },
  { label: "Health", name: "Health", kind: "expense", cadence: "monthly", amount_hint: "e.g. 100" },
  { label: "Giving", name: "Giving", kind: "expense", cadence: "monthly", amount_hint: "e.g. 50" },

  { label: "Emergency fund", name: "Emergency fund", kind: "saving", cadence: "monthly", amount_hint: "e.g. 200" },
  { label: "Buffer", name: "Buffer", kind: "saving", cadence: "monthly", amount_hint: "e.g. 100" },

  { label: "Car repairs", name: "Car repairs", kind: "sinking", cadence: "monthly", amount_hint: "e.g. 60" },
  { label: "Medical", name: "Medical", kind: "sinking", cadence: "monthly", amount_hint: "e.g. 40" },
  { label: "Gifts", name: "Gifts", kind: "sinking", cadence: "monthly", amount_hint: "e.g. 30" },
  { label: "Holidays", name: "Holidays", kind: "sinking", cadence: "monthly", amount_hint: "e.g. 80" },
];

const LOAD_THROTTLE_MS = 1200;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function BudgetClient() {
  const router = useRouter();

  const toastApi: any = useToast();
  const showToast =
    toastApi?.showToast ??
    ((args: any) => {
      if (toastApi?.toast) {
        toastApi.toast({
          title: args?.title ?? "Done",
          description: args?.description ?? args?.message ?? "",
          variant: args?.variant,
          action: args?.action,
        });
      }
    });

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  const [statusLine, setStatusLine] = useState("Loading…");
  const [live, setLive] = useState<LiveState>("connecting");

  // inputs snapshot
  const [accountsTotalCents, setAccountsTotalCents] = useState(0);
  const [incomeMonthlyCents, setIncomeMonthlyCents] = useState(0);
  const [billsMonthlyCents, setBillsMonthlyCents] = useState(0);

  // plan
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // add form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [kind, setKind] = useState<BudgetKind>("expense");
  const [saving, setSaving] = useState(false);

  // search
  const [q, setQ] = useState("");

  // inline edit
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; amount_input: string; cadence: Cadence; kind: BudgetKind; active: boolean }>
  >({});

  // V1 calm: show top 5 per section by default
  const [showAllByKind, setShowAllByKind] = useState<Record<BudgetKind, boolean>>({
    expense: false,
    saving: false,
    sinking: false,
  });

  // silent reload throttle
  const lastLoadAtRef = useRef<number>(0);
  const pendingSilentReloadRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedRefetchRef = useRef(false);
  const isMountedRef = useRef(true);

  async function resolveActiveHouseholdId(): Promise<string> {
    // We reuse money API since it already returns household_id using cookie/fallback logic.
    const data = await fetchJson<{ ok: boolean; household_id: string }>("/api/money/accounts");
    if (!data?.household_id) throw new Error("User not linked to a household.");
    return data.household_id;
  }

  async function loadAll(uid: string, hid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (silent) {
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) {
        if (pendingSilentReloadRef.current) window.clearTimeout(pendingSilentReloadRef.current);
        pendingSilentReloadRef.current = window.setTimeout(() => {
          pendingSilentReloadRef.current = null;
          void loadAll(uid, hid, { silent: true });
        }, LOAD_THROTTLE_MS);
        return;
      }
    }
    lastLoadAtRef.current = now;

    if (inFlightRef.current) {
      queuedRefetchRef.current = true;
      return;
    }

    inFlightRef.current = true;
    queuedRefetchRef.current = false;

    if (!silent) {
      setStatusLine("Loading…");
      setError(null);
    }

    try {
      // 1) Accounts snapshot
      const accRes = await supabase.from("accounts").select("current_balance_cents,archived").eq("household_id", hid);
      if (!accRes.error) {
        const rows = (accRes.data ?? []) as any as AccountsRow[];
        const activeRows = rows.filter((r) => !r.archived);
        const total = activeRows.reduce((sum, r) => sum + safeNumber(r.current_balance_cents), 0);
        setAccountsTotalCents(cents(total));
      } else {
        setAccountsTotalCents(0);
      }

      // 2) Monthly income estimate
      const incomeRes = await supabase.from("recurring_income").select("amount_cents,cadence,active").eq("household_id", hid);
      if (!incomeRes.error) {
        const rows = (incomeRes.data ?? []) as any as IncomeRow[];
        const activeRows = rows.filter((r) => r.active !== false);
        const totalMonthly = activeRows.reduce((sum, r) => sum + monthlyEstimate(safeNumber(r.amount_cents), r.cadence), 0);
        setIncomeMonthlyCents(cents(totalMonthly));
      } else {
        setIncomeMonthlyCents(0);
      }

      // 3) Monthly bills estimate
      const billsRes = await supabase.from("recurring_bills").select("amount_cents,cadence,active").eq("household_id", hid);
      if (!billsRes.error) {
        const rows = (billsRes.data ?? []) as any as BillsRow[];
        const activeRows = rows.filter((r) => r.active !== false);
        const totalMonthly = activeRows.reduce((sum, r) => sum + monthlyEstimate(safeNumber(r.amount_cents), r.cadence), 0);
        setBillsMonthlyCents(cents(totalMonthly));
      } else {
        setBillsMonthlyCents(0);
      }

      // 4) Budget plan items (HOUSEHOLD SCOPED)
      const planRes = await supabase
        .from("budget_items")
        .select("id,household_id,user_id,name,kind,amount_cents,cadence,active,sort_order,created_at,updated_at")
        .eq("household_id", hid)
        .order("sort_order", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (planRes.error) {
        setItems([]);
        setError(planRes.error.message);
        setStatusLine("Budget needs setup (budget_items).");
        return;
      }

      const normalized = (planRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        household_id: String(r.household_id),
        user_id: String(r.user_id),
        name: String(r.name ?? ""),
        kind: (r.kind === "saving" || r.kind === "sinking" ? r.kind : "expense") as BudgetKind,
        amount_cents: safeNumber(r.amount_cents),
        cadence: normalizeCadence(r.cadence),
        active: r.active !== false,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      })) as BudgetItem[];

      setItems(normalized);
      setStatusLine("Loaded.");
    } catch (e: any) {
      setError(e?.message ?? "Load failed.");
      setStatusLine("Load failed.");
    } finally {
      inFlightRef.current = false;

      if (!isMountedRef.current) return;
      if (queuedRefetchRef.current) {
        queuedRefetchRef.current = false;
        void loadAll(uid, hid, { silent: true });
      }
    }
  }

  // boot
  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;

      if (authError || !auth?.user) {
        setUserId(null);
        setHouseholdId(null);
        setStatusLine("Not signed in.");
        setLive("offline");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      try {
        const hid = await resolveActiveHouseholdId();
        if (!isMountedRef.current) return;
        setHouseholdId(hid);
        await loadAll(uid, hid);
      } catch (e: any) {
        setHouseholdId(null);
        setError(e?.message ?? "Couldn’t resolve household.");
        setStatusLine("Couldn’t load.");
        setLive("offline");
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime (HOUSEHOLD SCOPED)
  useEffect(() => {
    if (!userId || !householdId) return;

    setLive("connecting");

    const filter = `household_id=eq.${householdId}`;

    const ch = supabase
      .channel(`budget_household_${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "budget_items", filter }, () => void loadAll(userId, householdId, { silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "recurring_income", filter }, () => void loadAll(userId, householdId, { silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "recurring_bills", filter }, () => void loadAll(userId, householdId, { silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter }, () => void loadAll(userId, householdId, { silent: true }))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
        else setLive("connecting");
      });

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, householdId]);

  // focus refresh (silent)
  useEffect(() => {
    const onFocus = () => {
      if (!userId || !householdId) return;
      void loadAll(userId, householdId, { silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId, householdId]);

  // derived: plan totals
  const planMonthlyCents = useMemo(() => {
    const active = items.filter((i) => i.active);
    return active.reduce((sum, i) => sum + cents(i.amount_cents * monthlyFactor(i.cadence)), 0);
  }, [items]);

  const leftoverCents = useMemo(
    () => incomeMonthlyCents - billsMonthlyCents - planMonthlyCents,
    [incomeMonthlyCents, billsMonthlyCents, planMonthlyCents]
  );

  const risk = useMemo(() => {
    if (incomeMonthlyCents <= 0) return "no_income";
    if (leftoverCents < 0) return "negative";
    if (leftoverCents < cents(incomeMonthlyCents * 0.05)) return "tight";
    return "ok";
  }, [incomeMonthlyCents, leftoverCents]);

  // search filter
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.name.toLowerCase().includes(needle));
  }, [items, q]);

  // grouped
  const grouped = useMemo(() => {
    const byKind: Record<BudgetKind, BudgetItem[]> = { expense: [], saving: [], sinking: [] };

    for (const it of filtered) byKind[it.kind].push(it);

    const sortFn = (a: BudgetItem, b: BudgetItem) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const ao = typeof a.sort_order === "number" ? a.sort_order : 9999;
      const bo = typeof b.sort_order === "number" ? b.sort_order : 9999;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    };

    (Object.keys(byKind) as BudgetKind[]).forEach((k) => byKind[k].sort(sortFn));

    const monthlyByKind: Record<BudgetKind, number> = { expense: 0, saving: 0, sinking: 0 };
    for (const it of items.filter((x) => x.active)) {
      monthlyByKind[it.kind] += cents(it.amount_cents * monthlyFactor(it.cadence));
    }

    return { byKind, monthlyByKind };
  }, [filtered, items]);

  const applyStarter = (s: Starter) => {
    setName(s.name);
    setKind(s.kind);
    setCadence(s.cadence);
    setAmount("");
    notify({ title: "Prefilled", description: s.label });
  };

  async function addItem() {
    if (!userId || !householdId) return;

    const cleanName = name.trim();
    if (!cleanName) {
      notify({ title: "Add item", description: "Name is required." });
      return;
    }

    const amountCents = centsFromInput(amount);
    if (!amountCents || amountCents <= 0) {
      notify({ title: "Add item", description: "Amount is required." });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("budget_items")
        .insert({
          household_id: householdId,
          user_id: userId,
          name: cleanName,
          kind,
          cadence,
          amount_cents: amountCents,
          active: true,
        })
        .select("id,household_id,user_id,name,kind,amount_cents,cadence,active,sort_order,created_at,updated_at")
        .single();

      if (error) throw error;

      setItems((prev) => [...prev, data as any]);
      setName("");
      setAmount("");
      setCadence("monthly");
      setKind("expense");
      notify({ title: "Saved", description: "Added to plan." });
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Couldn’t add item." });
      void loadAll(userId, householdId, { silent: true });
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(it: BudgetItem) {
    setOpenId(it.id);
    setDrafts((prev) => ({
      ...prev,
      [it.id]: {
        name: it.name,
        amount_input: ((it.amount_cents || 0) / 100).toFixed(2),
        cadence: it.cadence,
        kind: it.kind,
        active: it.active,
      },
    }));
  }

  function cancelEdit(id: string) {
    setOpenId((cur) => (cur === id ? null : cur));
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  async function saveEdit(id: string) {
    if (!userId || !householdId) return;

    const d = drafts[id];
    if (!d) return;

    const cleanName = (d.name || "").trim();
    if (!cleanName) {
      notify({ title: "Save", description: "Name can’t be empty." });
      return;
    }

    const amountCents = centsFromInput(d.amount_input || "");
    if (!amountCents || amountCents <= 0) {
      notify({ title: "Save", description: "Amount is required." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: cleanName,
        kind: d.kind,
        cadence: d.cadence,
        amount_cents: amountCents,
        active: !!d.active,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("budget_items")
        .update(payload)
        .eq("id", id)
        .eq("household_id", householdId);

      if (error) throw error;

      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...payload } : x)));
      cancelEdit(id);
      notify({ title: "Saved", description: "Updated." });
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Couldn’t save." });
      void loadAll(userId, householdId, { silent: true });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(it: BudgetItem) {
    if (!userId || !householdId) return;

    const next = !it.active;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, active: next } : x)));

    const { error } = await supabase
      .from("budget_items")
      .update({ active: next, updated_at: new Date().toISOString() })
      .eq("id", it.id)
      .eq("household_id", householdId);

    if (error) {
      notify({ title: "Error", description: error.message });
      void loadAll(userId, householdId, { silent: true });
    }
  }

  async function removeItem(it: BudgetItem) {
    if (!userId || !householdId) return;

    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== it.id));

    showToast({
      message: `"${it.name}" removed.`,
      undoLabel: "Undo",
      onUndo: async () => {
        setItems(snapshot);
        void loadAll(userId, householdId, { silent: true });
      },
    });

    const { error: delErr } = await supabase.from("budget_items").delete().eq("id", it.id).eq("household_id", householdId);
    if (delErr) {
      setItems(snapshot);
      notify({ title: "Error", description: delErr.message });
    }
  }

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const pictureHint = useMemo(() => {
    if (risk === "no_income") return "Add income sources to get a monthly picture.";
    if (risk === "negative") return "Plan is over budget. Reduce plan or bills, or raise income.";
    if (risk === "tight") return "Tight month. Keep plan lean or add buffer.";
    return "Looks balanced.";
  }, [risk]);

  const pictureHintClass =
    risk === "negative"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : risk === "tight"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-zinc-200 bg-white text-zinc-700";

  const Section = ({ k }: { k: BudgetKind }) => {
    const list = grouped.byKind[k];
    const monthlyTotal = grouped.monthlyByKind[k];

    const LIMIT = 5;
    const showAll = !!showAllByKind[k];
    const visible = showAll ? list : list.slice(0, LIMIT);
    const hidden = Math.max(0, list.length - visible.length);

    return (
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">{labelKind(k)}</div>
              <div className="text-xs text-zinc-500">Monthly est: {formatMoneyFromCents(monthlyTotal)}</div>
            </div>

            {list.length > LIMIT ? (
              <Chip onClick={() => setShowAllByKind((prev) => ({ ...prev, [k]: !prev[k] }))} title="Toggle list length">
                {showAll ? "Show less" : "Show all"}
              </Chip>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2">
            {visible.length === 0 ? (
              <div className="text-sm text-zinc-600">Nothing here yet.</div>
            ) : (
              visible.map((it) => {
                const isOpen = openId === it.id;
                const d = drafts[it.id];
                const est = cents(it.amount_cents * monthlyFactor(it.cadence));

                return (
                  <div key={it.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-[220px] flex-1">
                        {!isOpen ? (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-zinc-900">{it.name}</div>
                              {it.active ? <Badge>Active</Badge> : <Badge>Paused</Badge>}
                              <Chip>{it.cadence}</Chip>
                            </div>

                            <div className="mt-1 text-sm text-zinc-700">
                              {formatMoneyFromCents(it.amount_cents)} • <span className="text-xs text-zinc-500">Monthly est</span>{" "}
                              <span className="font-semibold text-zinc-900">{formatMoneyFromCents(est)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="grid gap-2 md:grid-cols-6">
                            <div className="md:col-span-2">
                              <div className="text-xs text-zinc-500 mb-1">Name</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                value={d?.name ?? it.name}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [it.id]: { ...prev[it.id], name: e.target.value },
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <div className="text-xs text-zinc-500 mb-1">Amount</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                value={d?.amount_input ?? ((it.amount_cents || 0) / 100).toFixed(2)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [it.id]: { ...prev[it.id], amount_input: e.target.value },
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <div className="text-xs text-zinc-500 mb-1">Cadence</div>
                              <select
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                value={(d?.cadence ?? it.cadence) as Cadence}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [it.id]: { ...prev[it.id], cadence: normalizeCadence(e.target.value) },
                                  }))
                                }
                              >
                                <option value="weekly">Weekly</option>
                                <option value="fortnightly">Fortnightly</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                              </select>
                            </div>

                            <div className="md:col-span-2">
                              <div className="text-xs text-zinc-500 mb-1">Section</div>
                              <select
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                value={(d?.kind ?? it.kind) as BudgetKind}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [it.id]: { ...prev[it.id], kind: e.target.value as BudgetKind },
                                  }))
                                }
                              >
                                <option value="expense">Spending</option>
                                <option value="saving">Saving</option>
                                <option value="sinking">Sinking fund</option>
                              </select>
                            </div>

                            <div className="md:col-span-6 flex items-center gap-3 flex-wrap">
                              <label className="flex items-center gap-2 text-sm text-zinc-700">
                                <input
                                  type="checkbox"
                                  checked={!!(d?.active ?? it.active)}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [it.id]: { ...prev[it.id], active: e.target.checked },
                                    }))
                                  }
                                />
                                Active
                              </label>

                              <div className="text-xs text-zinc-500">
                                Monthly est{" "}
                                <span className="font-semibold text-zinc-900">
                                  {formatMoneyFromCents(cents(centsFromInput(d?.amount_input ?? "") * monthlyFactor(d?.cadence ?? it.cadence)))}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {!isOpen ? (
                          <>
                            <Chip onClick={() => void toggleActive(it)} title={it.active ? "Pause item" : "Resume item"}>
                              {it.active ? "Pause" : "Resume"}
                            </Chip>
                            <Chip onClick={() => beginEdit(it)} title="Edit">
                              Edit
                            </Chip>
                            <Chip
                              onClick={() => void removeItem(it)}
                              title="Remove"
                              className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            >
                              Remove
                            </Chip>
                          </>
                        ) : (
                          <>
                            <Chip onClick={() => void saveEdit(it.id)} title="Save" disabled={saving}>
                              Save
                            </Chip>
                            <Chip onClick={() => cancelEdit(it.id)} title="Cancel">
                              Cancel
                            </Chip>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {hidden > 0 ? <div className="text-xs text-zinc-500">{hidden} more hidden — use search to find anything.</div> : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const right = (
    <div className="flex items-center gap-2">
      <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>
      {userId && householdId ? (
        <Chip onClick={() => void loadAll(userId, householdId)} title="Refresh">
          Refresh
        </Chip>
      ) : null}
      <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
    </div>
  );

  return (
    <Page title="Budget" subtitle="A monthly view from your inputs. Adjust the plan to match reality." right={right}>
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        {/* Monthly picture */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Monthly picture</div>

                <div className="grid gap-2 text-sm text-zinc-700">
                  <div className="flex items-center justify-between gap-6">
                    <div>Estimated income</div>
                    <div className="font-medium text-zinc-900">{formatMoneyFromCents(incomeMonthlyCents)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div>Estimated bills</div>
                    <div className="font-medium text-zinc-900">− {formatMoneyFromCents(billsMonthlyCents)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <div>Planned (budget items)</div>
                    <div className="font-medium text-zinc-900">− {formatMoneyFromCents(planMonthlyCents)}</div>
                  </div>

                  <div className="mt-1 h-px bg-zinc-100" />

                  <div className="flex items-center justify-between gap-6">
                    <div className="font-semibold text-zinc-900">Left after bills + plan</div>
                    <div className="font-semibold text-zinc-900">
                      {leftoverCents >= 0 ? formatMoneyFromCents(leftoverCents) : `− ${formatMoneyFromCents(Math.abs(leftoverCents))}`}
                    </div>
                  </div>
                </div>

                <div className={["mt-2 rounded-2xl border px-3 py-2 text-sm", pictureHintClass].join(" ")}>{pictureHint}</div>
              </div>

              <div className="min-w-[220px] space-y-2">
                <div className="text-xs font-semibold text-zinc-600">Inputs snapshot</div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-4 text-sm text-zinc-700">
                    <div>Accounts total</div>
                    <div className="font-medium text-zinc-900">{formatMoneyFromCents(accountsTotalCents)}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">Sum of non-archived accounts.</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Chip onClick={() => router.push("/income")} title="Manage income inputs">
                    Edit Income
                  </Chip>
                  <Chip onClick={() => router.push("/bills")} title="Manage bills inputs">
                    Edit Bills
                  </Chip>
                  <Chip onClick={() => router.push("/accounts")} title="Manage accounts inputs">
                    Edit Accounts
                  </Chip>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick starters */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">Quick add</div>
              <div className="text-sm text-zinc-600">Tap to prefill. Add an amount, then save.</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Chip
                  key={s.label}
                  onClick={() => applyStarter(s)}
                  title={`${labelKind(s.kind)} • ${s.cadence}${s.amount_hint ? ` • ${s.amount_hint}` : ""}`}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Add item */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">Add budget item</div>
              <div className="text-xs text-zinc-500">Everything converts to a monthly estimate so you can compare apples to apples.</div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Name</div>
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  placeholder="Groceries, fuel, giving…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Amount (AUD)</div>
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  placeholder="e.g. 250"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Cadence</div>
                <select
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  value={cadence}
                  onChange={(e) => setCadence(normalizeCadence(e.target.value))}
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Section</div>
                <select
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as BudgetKind)}
                >
                  <option value="expense">Spending</option>
                  <option value="saving">Saving</option>
                  <option value="sinking">Sinking fund</option>
                </select>
              </div>

              <div className="md:col-span-6 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-zinc-500">
                  Monthly est{" "}
                  <span className="font-semibold text-zinc-900">{formatMoneyFromCents(cents(centsFromInput(amount) * monthlyFactor(cadence)))}</span>
                </div>

                <Button disabled={saving || !userId || !householdId} onClick={() => void addItem()}>
                  {saving ? "Saving…" : "Add"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">Plan</div>
              <div className="text-xs text-zinc-500">
                {items.filter((x) => x.active).length} active • {items.length} total
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Search budget items…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q.trim() ? (
                <Chip onClick={() => setQ("")} title="Clear">
                  Clear
                </Chip>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="space-y-3">
          <Section k="expense" />
          <Section k="sinking" />
          <Section k="saving" />
        </div>

        {/* Footnotes */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>Income + Bills use your inputs. Budget items are your plan. Everything is converted to a monthly estimate for comparison.</div>
              <div>Nothing here is a forecast. It’s a picture of what you told Life CFO is true.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}