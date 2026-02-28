"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

type RecurringIncome = {
  id: string;
  household_id: string;
  user_id: string; // audit/creator

  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_pay_at: string;
  active: boolean;

  created_at: string;
  updated_at: string;
};

type LiveStatus = "connecting" | "live" | "offline";

/* ---------- helpers ---------- */

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
  const [whole, frac = ""] = cleaned.split(".");
  return parseInt(whole || "0", 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
}

// ✅ format as $12,345.67 (on blur)
function formatMoneyInput(input: string, currency = "AUD") {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const cents = centsFromInput(raw);
  return formatMoneyFromCents(cents, currency);
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(localValue: string) {
  return new Date(localValue).toISOString();
}

function sortIncome(rows: RecurringIncome[]) {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return Date.parse(a.next_pay_at) - Date.parse(b.next_pay_at);
  });
}

function cadenceLabel(c: Cadence) {
  if (c === "weekly") return "Weekly";
  if (c === "fortnightly") return "Fortnightly";
  if (c === "monthly") return "Monthly";
  if (c === "yearly") return "Yearly";
  return c;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

async function resolveActiveHouseholdId(): Promise<string> {
  // Reuse money API: already cookie/fallback household logic
  const data = await fetchJson<{ ok: boolean; household_id: string }>("/api/money/accounts");
  if (!data?.household_id) throw new Error("User not linked to a household.");
  return data.household_id;
}

/* ---------- page ---------- */

export const dynamic = "force-dynamic";

export default function IncomePage() {
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  const [items, setItems] = useState<RecurringIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");

  /* add form */
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("fortnightly");
  const [nextPayLocal, setNextPayLocal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalInputValue(d.toISOString());
  });
  const [active, setActive] = useState(true);

  /* ---------- load ---------- */

  async function loadIncome(hid: string, silent = false) {
    if (!silent) setError(null);

    const { data, error } = await supabase
      .from("recurring_income")
      .select("*")
      .eq("household_id", hid)
      .order("active", { ascending: false })
      .order("next_pay_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setItems(sortIncome((data || []) as RecurringIncome[]));
  }

  useEffect(() => {
    (async () => {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data.user) {
        setError("Not signed in.");
        setLoading(false);
        setLiveStatus("offline");
        return;
      }

      setUserId(data.user.id);

      try {
        const hid = await resolveActiveHouseholdId();
        setHouseholdId(hid);
        await loadIncome(hid);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load Income.");
        setLiveStatus("offline");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* realtime */
  useEffect(() => {
    if (!householdId) return;

    setLiveStatus("connecting");

    const channel = supabase
      .channel(`income_household_${householdId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_income", filter: `household_id=eq.${householdId}` },
        () => loadIncome(householdId, true)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveStatus("offline");
        else setLiveStatus("connecting");
      });

    return () => {
      supabase.removeChannel(channel);
      setLiveStatus("offline");
    };
  }, [householdId]);

  /* ---------- actions ---------- */

  async function addIncome() {
    if (!userId || !householdId || !name.trim()) {
      showToast({ message: "Please enter an income name." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        household_id: householdId,
        user_id: userId, // audit/creator
        name: name.trim(),
        amount_cents: centsFromInput(amount),
        currency: "AUD",
        cadence,
        next_pay_at: fromLocalInputValue(nextPayLocal),
        active,
      };

      const { error } = await supabase.from("recurring_income").insert(payload);
      if (error) throw error;

      setName("");
      setAmount("");
      setCadence("fortnightly");
      setActive(true);

      showToast({ message: "Income added." });
      await loadIncome(householdId, true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Failed to add income." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(i: RecurringIncome) {
    if (!householdId) return;
    const next = !i.active;

    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, active: next } : x)));

    const { error } = await supabase
      .from("recurring_income")
      .update({ active: next })
      .eq("id", i.id)
      .eq("household_id", householdId);

    if (error) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, active: i.active } : x)));
      showToast({ message: error.message });
    }
  }

  async function deleteIncome(i: RecurringIncome) {
    if (!householdId) return;

    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== i.id));

    showToast({
      message: `"${i.name}" removed.`,
      undoLabel: "Undo",
      onUndo: async () => {
        setItems(snapshot);
        await loadIncome(householdId, true);
      },
    });

    await supabase.from("recurring_income").delete().eq("id", i.id).eq("household_id", householdId);
  }

  const activeIncome = items.filter((i) => i.active);

  const liveChipClass =
    liveStatus === "live"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : liveStatus === "offline"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-700";

  /* ---------- render ---------- */

  return (
    <Page
      title="Income"
      subtitle="Income you’ve told Keystone is true. No estimates, no assumptions."
      right={
        <div className="flex items-center gap-2">
          <Chip className={liveChipClass}>
            {liveStatus === "live" ? "Live" : liveStatus === "offline" ? "Offline" : "Connecting"}
          </Chip>
          <Chip onClick={() => householdId && loadIncome(householdId)}>Refresh</Chip>
        </div>
      }
    >
      <div className="grid gap-4 max-w-[760px] mx-auto">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 flex-wrap">
            <Badge>Active: {activeIncome.length}</Badge>
            <Badge>Total sources: {items.length}</Badge>
            {loading ? <Chip>Loading…</Chip> : null}
            {error ? <Chip>{error}</Chip> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="font-semibold">Add income</div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2 space-y-1">
                <div className="text-xs text-zinc-500">Name</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="Wages, Centrelink, Rent…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Amount</div>
                <input
                  className="rounded-md border px-3 py-2 bg-transparent w-full"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount((v) => formatMoneyInput(v, "AUD"))}
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Interval</div>
                <select
                  className="rounded-md border px-3 py-2 bg-transparent w-full"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as Cadence)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <div className="text-xs text-zinc-500">Next pay</div>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  value={nextPayLocal}
                  onChange={(e) => setNextPayLocal(e.target.value)}
                />
              </div>

              <div className="md:col-span-6 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active
                </label>

                <Button disabled={saving || !householdId} onClick={addIncome}>
                  {saving ? "Saving…" : "Add"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="font-semibold">Your income</div>

            {items.length === 0 ? (
              <div className="text-sm opacity-70">Nothing added yet.</div>
            ) : (
              items.map((i) => (
                <div key={i.id} className="rounded-lg border p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {i.name}
                      {i.active ? <Badge>Active</Badge> : <Badge>Paused</Badge>}
                      <Chip>{cadenceLabel(i.cadence)}</Chip>
                    </div>
                    <div className="text-sm opacity-75">
                      {formatMoneyFromCents(i.amount_cents)} • Next {new Date(i.next_pay_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={() => toggleActive(i)}>{i.active ? "Pause" : "Activate"}</Button>
                    <Button onClick={() => deleteIncome(i)}>Delete</Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}