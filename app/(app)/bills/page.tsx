// app/(app)/bills/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

type LiveState = "connecting" | "live" | "offline";
type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

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

type BillPayment = {
  id: string;
  user_id: string;
  bill_id: string;
  paid_at: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  source: string;
  created_at: string;
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

function centsFromInput(input: string): number {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;

  const parts = cleaned.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").slice(0, 2);
  const fracPadded = (frac + "00").slice(0, 2);

  const cents = parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
  return Number.isFinite(cents) ? cents : 0;
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputValue(localValue: string) {
  const d = new Date(localValue);
  return d.toISOString();
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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
// -------------------- end cadence bump helpers --------------------

const LOAD_THROTTLE_MS = 1500;

// -------------------- filter helpers --------------------
type BillsFilter = "due14" | "due7" | "autopay_risk" | null;

function readBillsFilterFromUrl(): BillsFilter {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = (url.searchParams.get("filter") || "").trim();
  if (raw === "due14" || raw === "due7" || raw === "autopay_risk") return raw;
  return null;
}

function labelForBillsFilter(f: BillsFilter) {
  if (!f) return null;
  if (f === "due14") return "Due in 14 days";
  if (f === "due7") return "Due in 7 days";
  if (f === "autopay_risk") return "Autopay risk";
  return null;
}

function isDueWithinDays(b: RecurringBill, days: number) {
  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  const t = new Date(b.next_due_at).getTime();
  return Number.isFinite(t) && t >= now && t <= until;
}

function isAutopayRisk(b: RecurringBill) {
  return b.active && !b.autopay && isDueWithinDays(b, 14);
}

function setUrlFilter(next: BillsFilter) {
  try {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("filter", next);
    else url.searchParams.delete("filter");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // no-op
  }
}
// -------------------- end filter helpers --------------------

// -------------------- quick add suggestions --------------------
type BillSuggestion = {
  label: string;
  name: string;
  cadence: Cadence;
  autopayDefault: boolean;
};

const SUGGESTIONS: BillSuggestion[] = [
  { label: "Rent / Mortgage", name: "Rent", cadence: "weekly", autopayDefault: true },
  { label: "Electricity", name: "Electricity", cadence: "monthly", autopayDefault: true },
  { label: "Gas", name: "Gas", cadence: "monthly", autopayDefault: true },
  { label: "Water", name: "Water", cadence: "monthly", autopayDefault: true },
  { label: "Internet", name: "Internet", cadence: "monthly", autopayDefault: true },
  { label: "Mobile", name: "Mobile", cadence: "monthly", autopayDefault: true },
  { label: "Insurance", name: "Insurance", cadence: "monthly", autopayDefault: true },
  { label: "Car rego", name: "Car registration", cadence: "yearly", autopayDefault: false },
  { label: "Rates", name: "Council rates", cadence: "monthly", autopayDefault: false },
  { label: "Childcare", name: "Childcare", cadence: "fortnightly", autopayDefault: false },
  { label: "Streaming", name: "Streaming subscription", cadence: "monthly", autopayDefault: true },
];

function nextDueDefaultForCadence(c: Cadence) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);

  if (c === "weekly") d.setDate(d.getDate() + 7);
  else if (c === "fortnightly") d.setDate(d.getDate() + 14);
  else if (c === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);

  return toLocalInputValue(d.toISOString());
}
// -------------------- end suggestions --------------------

export default function BillsPage() {
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [live, setLive] = useState<LiveState>("connecting");

  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [error, setError] = useState<string | null>(null);

  // receipts (lightweight)
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [receiptsOpen, setReceiptsOpen] = useState(false);

  // Landing filter from Engine links + in-page chips
  const [filter, setFilter] = useState<BillsFilter>(null);

  // Silent reload throttle
  const lastLoadAtRef = useRef<number>(0);
  const pendingSilentReloadRef = useRef<number | null>(null);

  // Add form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [nextDueLocal, setNextDueLocal] = useState(() => nextDueDefaultForCadence("monthly"));
  const [autopay, setAutopay] = useState(false);
  const [active, setActive] = useState(true);

  // Inline edit drafts
  const [drafts, setDrafts] = useState<Record<string, Partial<RecurringBill> & { amount_input?: string; next_due_local?: string }>>({});

  // Mark paid busy map
  const [markingPaid, setMarkingPaid] = useState<Record<string, boolean>>({});

  async function loadBills(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (silent) {
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) {
        if (pendingSilentReloadRef.current) window.clearTimeout(pendingSilentReloadRef.current);
        pendingSilentReloadRef.current = window.setTimeout(() => {
          pendingSilentReloadRef.current = null;
          loadBills(uid, { silent: true });
        }, LOAD_THROTTLE_MS);
        return;
      }
    }
    lastLoadAtRef.current = now;

    if (!silent) setError(null);

    const { data, error } = await supabase
      .from("recurring_bills")
      .select("*")
      .eq("user_id", uid)
      .order("active", { ascending: false })
      .order("next_due_at", { ascending: true });

    if (error) {
      if (!silent) setError(error.message);
      return;
    }
    setBills((data || []) as RecurringBill[]);
  }

  async function loadPayments(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) setPaymentsError(null);

    const { data, error } = await supabase
      .from("bill_payments")
      .select("*")
      .eq("user_id", uid)
      .order("paid_at", { ascending: false })
      .limit(20);

    if (error) {
      if (!silent) setPaymentsError(error.message);
      return;
    }
    setPayments((data || []) as BillPayment[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      const landing = readBillsFilterFromUrl();
      setFilter(landing);

      setUserId(data.user.id);
      await Promise.all([loadBills(data.user.id), loadPayments(data.user.id, { silent: true })]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilter() {
    setFilter(null);
    setUrlFilter(null);
  }

  function applyFilter(next: BillsFilter) {
    setFilter(next);
    setUrlFilter(next);
  }

  // Realtime patching (user-scoped)
  useEffect(() => {
    if (!userId) return;

    setLive("connecting");

    const channel = supabase
      .channel(`recurring_bills:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recurring_bills", filter: `user_id=eq.${userId}` }, (payload) => {
        try {
          const evt = payload.eventType;

          if (evt === "INSERT") {
            const row = payload.new as RecurringBill;
            setBills((prev) => {
              if (prev.some((x) => x.id === row.id)) return prev;
              // keep ordering calm: active desc + next due asc
              const merged = [...prev, row];
              merged.sort((a, b) => {
                if (a.active !== b.active) return a.active ? -1 : 1;
                const ta = Date.parse(a.next_due_at);
                const tb = Date.parse(b.next_due_at);
                const va = Number.isNaN(ta) ? 0 : ta;
                const vb = Number.isNaN(tb) ? 0 : tb;
                return va - vb;
              });
              return merged;
            });
            return;
          }

          if (evt === "UPDATE") {
            const row = payload.new as RecurringBill;
            setBills((prev) => {
              const merged = prev.map((x) => (x.id === row.id ? { ...x, ...row } : x));
              merged.sort((a, b) => {
                if (a.active !== b.active) return a.active ? -1 : 1;
                const ta = Date.parse(a.next_due_at);
                const tb = Date.parse(b.next_due_at);
                const va = Number.isNaN(ta) ? 0 : ta;
                const vb = Number.isNaN(tb) ? 0 : tb;
                return va - vb;
              });
              return merged;
            });
            return;
          }

          if (evt === "DELETE") {
            const oldRow = payload.old as { id: string };
            setBills((prev) => prev.filter((x) => x.id !== oldRow.id));
            return;
          }

          loadBills(userId, { silent: true });
        } catch {
          loadBills(userId, { silent: true });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bill_payments", filter: `user_id=eq.${userId}` }, (payload) => {
        // lightweight: prepend new payment
        try {
          const row = payload.new as BillPayment;
          setPayments((prev) => {
            if (prev.some((x) => x.id === row.id)) return prev;
            const merged = [row, ...prev];
            return merged.slice(0, 20);
          });
        } catch {
          loadPayments(userId, { silent: true });
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
        else setLive("connecting");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Focus refresh (silent)
  useEffect(() => {
    const onFocus = () => {
      if (!userId) return;
      loadBills(userId, { silent: true });
      loadPayments(userId, { silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);

  const due7 = useMemo(() => activeBills.filter((b) => isDueWithinDays(b, 7)), [activeBills]);
  const due14 = useMemo(() => activeBills.filter((b) => isDueWithinDays(b, 14)), [activeBills]);
  const autopayRiskCount = useMemo(() => activeBills.filter((b) => isAutopayRisk(b)).length, [activeBills]);

  const lastPaymentByBillId = useMemo(() => {
    const map: Record<string, BillPayment> = {};
    for (const p of payments) {
      if (!map[p.bill_id]) map[p.bill_id] = p; // payments already newest-first
    }
    return map;
  }, [payments]);

  const filteredBills = useMemo(() => {
    if (!filter) return bills;
    if (filter === "due14") return bills.filter((b) => b.active && isDueWithinDays(b, 14));
    if (filter === "due7") return bills.filter((b) => b.active && isDueWithinDays(b, 7));
    if (filter === "autopay_risk") return bills.filter((b) => isAutopayRisk(b));
    return bills;
  }, [bills, filter]);

  const VISIBLE_LIMIT = 5;

const visibleBills = useMemo(
  () => filteredBills.slice(0, VISIBLE_LIMIT),
  [filteredBills]
);

const hiddenBillsCount = Math.max(0, filteredBills.length - visibleBills.length);

  async function addBill() {
    if (!userId) return;

    const trimmed = name.trim();
    if (!trimmed) {
      notify({ title: "Add bill", description: "Please enter a bill name." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        name: trimmed,
        amount_cents: centsFromInput(amount),
        currency: "AUD",
        cadence,
        next_due_at: fromLocalInputValue(nextDueLocal),
        autopay,
        active,
      };

      const { error } = await supabase.from("recurring_bills").insert(payload);
      if (error) throw error;

      setName("");
      setAmount("");
      setCadence("monthly");
      setNextDueLocal(nextDueDefaultForCadence("monthly"));
      setAutopay(false);
      setActive(true);

      notify({ title: "Saved", description: "Recurring bill added." });
      await loadBills(userId, { silent: true });
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Failed to add bill." });
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(b: RecurringBill) {
    setDrafts((prev) => ({
      ...prev,
      [b.id]: {
        ...b,
        amount_input: ((b.amount_cents || 0) / 100).toFixed(2),
        next_due_local: toLocalInputValue(b.next_due_at),
      },
    }));
  }

  function cancelEdit(id: string) {
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  async function saveEdit(id: string) {
    if (!userId) return;
    const d = drafts[id];
    if (!d) return;

    setSaving(true);
    try {
      const updatePayload: any = {
        name: (d.name || "").trim(),
        cadence: d.cadence,
        autopay: !!d.autopay,
        active: !!d.active,
      };

      if (!updatePayload.name) {
        notify({ title: "Update", description: "Name can’t be empty." });
        setSaving(false);
        return;
      }

      if (typeof d.amount_input === "string") updatePayload.amount_cents = centsFromInput(d.amount_input);
      else if (typeof d.amount_cents === "number") updatePayload.amount_cents = d.amount_cents;

      if (typeof d.next_due_local === "string") updatePayload.next_due_at = fromLocalInputValue(d.next_due_local);

      const { error } = await supabase.from("recurring_bills").update(updatePayload).eq("id", id).eq("user_id", userId);

      if (error) throw error;

      notify({ title: "Saved", description: "Bill updated." });
      cancelEdit(id);
      await loadBills(userId, { silent: true });
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Failed to update bill." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: RecurringBill) {
    if (!userId) return;

    const newValue = !b.active;
    const previous = b.active;

    setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: newValue } : x)));

    try {
      const { error } = await supabase.from("recurring_bills").update({ active: newValue }).eq("id", b.id).eq("user_id", userId);

      if (error) throw error;

      notify({
        title: newValue ? "Active" : "Paused",
        description: `"${b.name}" is now ${newValue ? "active" : "paused"}.`,
      });
    } catch (e: any) {
      setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: previous } : x)));
      notify({ title: "Error", description: e?.message ?? "Failed to toggle." });
    }
  }

  async function markPaidWithReceipt(b: RecurringBill) {
    if (!userId) return;
    if (markingPaid[b.id]) return;

    setMarkingPaid((prev) => ({ ...prev, [b.id]: true }));

    const prevDue = b.next_due_at;
    const nextDue = bumpIsoByCadence(b.next_due_at, b.cadence);

    // optimistic UI: bump due date
    setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: nextDue } : x)));

    try {
      // 1) insert receipt (append-only)
      const { data: paymentRow, error: payErr } = await supabase
        .from("bill_payments")
        .insert({
          user_id: userId,
          bill_id: b.id,
          paid_at: new Date().toISOString(),
          amount_cents: b.amount_cents ?? 0,
          currency: b.currency ?? "AUD",
          note: "Paid via Bills page",
          source: "bills_page",
        })
        .select("*")
        .single();

      if (payErr) throw payErr;

      const paymentId = (paymentRow as any)?.id as string | undefined;
      if (!paymentId) throw new Error("Receipt inserted but missing id (unexpected).");

      // 2) bump next due
      const { error: upErr } = await supabase.from("recurring_bills").update({ next_due_at: nextDue }).eq("id", b.id).eq("user_id", userId);

      if (upErr) {
        // rollback receipt if the due-date update failed
        await supabase.from("bill_payments").delete().eq("id", paymentId).eq("user_id", userId);
        throw upErr;
      }

      showToast({
        message: `"${b.name}" marked paid ✅`,
        undoLabel: "Undo",
        onUndo: async () => {
          // optimistic revert
          setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: prevDue } : x)));
          setPayments((prev) => prev.filter((p) => p.id !== paymentId));

          const { error: dueErr } = await supabase.from("recurring_bills").update({ next_due_at: prevDue }).eq("id", b.id).eq("user_id", userId);
          const { error: delErr } = await supabase.from("bill_payments").delete().eq("id", paymentId).eq("user_id", userId);

          if (dueErr || delErr) {
            await Promise.all([loadBills(userId, { silent: true }), loadPayments(userId, { silent: true })]);
            showToast({ message: (dueErr?.message || delErr?.message || "Undo failed") as string });
            return;
          }

          showToast({ message: "Undone ✅" });
        },
      });

      await Promise.all([loadBills(userId, { silent: true }), loadPayments(userId, { silent: true })]);
    } catch (e: any) {
      // revert optimistic bump
      setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, next_due_at: prevDue } : x)));
      notify({ title: "Mark paid failed", description: e?.message ?? "Couldn’t mark paid." });
      await Promise.all([loadBills(userId, { silent: true }), loadPayments(userId, { silent: true })]);
    } finally {
      setMarkingPaid((prev) => ({ ...prev, [b.id]: false }));
    }
  }

  async function deleteBill(b: RecurringBill) {
    if (!userId) return;

    const snapshot = bills;
    setBills((prev) => prev.filter((x) => x.id !== b.id));

    showToast({
      message: `"${b.name}" removed.`,
      undoLabel: "Undo",
      onUndo: async () => {
        setBills(snapshot);
        try {
          const payload = {
            id: b.id,
            user_id: userId,
            name: b.name,
            amount_cents: b.amount_cents,
            currency: b.currency,
            cadence: b.cadence,
            next_due_at: b.next_due_at,
            autopay: b.autopay,
            active: b.active,
          };

          const { error } = await supabase.from("recurring_bills").insert(payload as any);
          if (error) throw error;

          await loadBills(userId, { silent: true });
          showToast({ message: "Restored." });
        } catch (e: any) {
          showToast({ message: e?.message ?? "Failed to restore." });
        }
      },
    });

    const { error } = await supabase.from("recurring_bills").delete().eq("id", b.id).eq("user_id", userId);

    if (error) {
      setBills(snapshot);
      showToast({ message: error.message });
    }
  }

  function applySuggestion(s: BillSuggestion) {
    setName(s.name);
    setCadence(s.cadence);
    setAutopay(s.autopayDefault);
    setNextDueLocal(nextDueDefaultForCadence(s.cadence));
    // keep amount empty (user knows it best)
    notify({ title: "Prefilled", description: s.label });
  }

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
        ? "border border-rose-200 bg-rose-50 text-rose-700"
        : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const filterLabel = useMemo(() => labelForBillsFilter(filter), [filter]);

  const recentReceipts = useMemo(() => payments.slice(0, receiptsOpen ? 20 : 8), [payments, receiptsOpen]);
  const billNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of bills) map[b.id] = b.name;
    return map;
  }, [bills]);

  const right = (
    <div className="flex items-center gap-2">
      <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>
      {userId ? (
        <Chip
          onClick={async () => {
            await Promise.all([loadBills(userId), loadPayments(userId, { silent: true })]);
          }}
          title="Refresh"
        >
          Refresh
        </Chip>
      ) : null}
    </div>
  );

  return (
    <Page title="Bills" subtitle="Inputs only. Keystone doesn’t guess — it only reminds." right={right}>
      <div className="grid gap-4">
        {/* Summary + calm filters */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge>Active: {activeBills.length}</Badge>
                <Badge>Due 7d: {due7.length}</Badge>
                <Badge>Due 14d: {due14.length}</Badge>
                <Badge>Autopay risk: {autopayRiskCount}</Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {loading ? <Chip>Loading…</Chip> : <Chip>{bills.length} total</Chip>}
                {error ? <Chip>{error}</Chip> : null}
                {paymentsError ? <Chip>Receipts: {paymentsError}</Chip> : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-xs text-zinc-500 mr-1">Filter</div>
              <Chip active={!filter} onClick={() => applyFilter(null)} title="Show all">
                All
              </Chip>
              <Chip active={filter === "due7"} onClick={() => applyFilter("due7")} title="Bills due in 7 days">
                Due 7d
              </Chip>
              <Chip active={filter === "due14"} onClick={() => applyFilter("due14")} title="Bills due in 14 days">
                Due 14d
              </Chip>
              <Chip active={filter === "autopay_risk"} onClick={() => applyFilter("autopay_risk")} title="Due soon and not autopay">
                Autopay risk
              </Chip>

              {filterLabel ? (
                <div className="ml-2 flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{filterLabel}</span>
                  <Chip onClick={clearFilter} title="Clear filter">
                    Clear
                  </Chip>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

{/* Search bills (escape hatch) */}
<Card>
  <CardContent>
    <AssistedSearch scope="bills" placeholder="Search bills…" />
  </CardContent>
</Card>

        {/* Quick add suggestions */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold">Quick add</div>
              <div className="text-sm opacity-70">Tap to prefill. You can still edit before saving.</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Chip key={s.label} onClick={() => applySuggestion(s)} title={`${s.cadence}${s.autopayDefault ? " • autopay" : ""}`}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Add bill form */}
        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Add recurring bill</div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-sm mb-1 opacity-70">Name</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="Rent, Internet, Insurance…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm mb-1 opacity-70">Amount (AUD)</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="e.g. 120.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm mb-1 opacity-70">Cadence</div>
                <select className="w-full rounded-md border px-3 py-2 bg-transparent" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm mb-1 opacity-70">Next due</div>
                <input className="w-full rounded-md border px-3 py-2 bg-transparent" type="datetime-local" value={nextDueLocal} onChange={(e) => setNextDueLocal(e.target.value)} />
              </div>

              <div className="md:col-span-6 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
                    Autopay
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    Active
                  </label>
                </div>

                <Button disabled={saving || !userId} onClick={addBill}>
                  {saving ? "Saving…" : "Add bill"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bills list */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="font-semibold">Your bills</div>
              <div className="text-sm opacity-70">Mark paid writes a receipt and bumps the due date.</div>
            </div>

            <div className="grid gap-2">
              {visibleBills.length === 0 ? (
                <div className="opacity-70 text-sm">{bills.length === 0 ? "No bills yet." : "No bills match this filter."}</div>
              ) : (
                visibleBills.map((b) => {
                  const editing = !!drafts[b.id];
                  const d = drafts[b.id];
                  const busyPaid = !!markingPaid[b.id];
                  const lastPaid = lastPaymentByBillId[b.id];
                  const risk = isAutopayRisk(b);

                  return (
                    <div key={b.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-[240px] flex-1">
                          {!editing ? (
                            <>
                              <div className="font-semibold flex items-center gap-2 flex-wrap">
                                {b.name}
                                {b.active ? <Badge>Active</Badge> : <Badge>Paused</Badge>}
                                {b.autopay ? <Chip>Autopay</Chip> : null}
                                <Chip>{b.cadence}</Chip>
                                {risk ? <Chip title="Due soon and not autopay">Risk</Chip> : null}
                              </div>

                              <div className="text-sm opacity-75 mt-1">
                                {formatMoneyFromCents(b.amount_cents, b.currency)} • Next due {fmtDateTime(b.next_due_at)}
                              </div>

                              {lastPaid ? (
                                <div className="text-xs text-zinc-600 mt-1">
                                  Last paid {fmtDateTime(lastPaid.paid_at)} • {formatMoneyFromCents(lastPaid.amount_cents, lastPaid.currency)}
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-500 mt-1">No receipts yet.</div>
                              )}
                            </>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-6">
                              <div className="md:col-span-2">
                                <div className="text-xs opacity-70 mb-1">Name</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={String(d?.name ?? "")}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], name: e.target.value } }))}
                                />
                              </div>

                              <div>
                                <div className="text-xs opacity-70 mb-1">Amount</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={String(d?.amount_input ?? "")}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], amount_input: e.target.value } }))}
                                />
                              </div>

                              <div>
                                <div className="text-xs opacity-70 mb-1">Cadence</div>
                                <select
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={(d?.cadence as Cadence) ?? b.cadence}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], cadence: e.target.value as Cadence } }))}
                                >
                                  <option value="weekly">Weekly</option>
                                  <option value="fortnightly">Fortnightly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <div className="text-xs opacity-70 mb-1">Next due</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  type="datetime-local"
                                  value={String(d?.next_due_local ?? toLocalInputValue(b.next_due_at))}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], next_due_local: e.target.value } }))}
                                />
                              </div>

                              <div className="md:col-span-6 flex items-center gap-4 flex-wrap">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!d?.autopay}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], autopay: e.target.checked } }))}
                                  />
                                  Autopay
                                </label>

                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!d?.active}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], active: e.target.checked } }))}
                                  />
                                  Active
                                </label>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {!editing ? (
                            <>
                              <Chip onClick={() => markPaidWithReceipt(b)} disabled={saving || !userId || busyPaid} title="Writes a receipt + bumps next due date">
                                {busyPaid ? "Marking…" : "Mark paid"}
                              </Chip>

                              <Chip onClick={() => toggleActive(b)} disabled={saving} title={b.active ? "Pause bill" : "Activate bill"}>
                                {b.active ? "Pause" : "Activate"}
                              </Chip>

                              <Chip onClick={() => beginEdit(b)} disabled={saving} title="Edit bill">
                                Edit
                              </Chip>
                              <Chip
                                onClick={() => deleteBill(b)}
                                disabled={saving}
                                title="Remove bill (undo available)"
                                className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              >
                                Delete
                              </Chip>
                            </>
                          ) : (
                            <>
                              <Chip onClick={() => saveEdit(b.id)} disabled={saving} title="Save changes">
                                Save
                              </Chip>
                              <Chip onClick={() => cancelEdit(b.id)} disabled={saving} title="Cancel editing">
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
            </div>
{hiddenBillsCount > 0 ? (
  <div className="mt-2 text-xs text-zinc-500">
    {hiddenBillsCount} more hidden — use search to find anything.
  </div>
) : null}
          </CardContent>
        </Card>

        {/* Receipts moved to the bottom (quiet) */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold">Receipts</div>
              <div className="flex items-center gap-2">
                <Chip onClick={() => setReceiptsOpen((v) => !v)} title="Show more or less">
                  {receiptsOpen ? "Show less" : "Show more"}
                </Chip>
              </div>
            </div>

            <div className="mt-1 text-sm opacity-70">A tiny trail — just enough to prove what happened.</div>

            {recentReceipts.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-600">No receipts yet. Mark a bill paid to create one.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {recentReceipts.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">
                        {billNameById[p.bill_id] ?? "Bill"} • {formatMoneyFromCents(p.amount_cents, p.currency)}
                      </div>
                      <div className="text-xs text-zinc-500">{fmtDateTime(p.paid_at)}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {p.note ? p.note : "—"} • source: {p.source}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

