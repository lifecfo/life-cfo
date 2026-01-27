// app/(app)/budget/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

type Bucket = {
  id: string;
  name: string;
  amount_cents: number;
};

type BudgetState = {
  monthly_income_cents: number;
  fixed_bills_cents: number;
  buckets: Bucket[];
  updated_at_iso: string;
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function toCents(input: string) {
  const cleaned = input.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromCents(cents: number) {
  const n = (cents ?? 0) / 100;
  // keep simple, no Intl currency formatting (avoids locale weirdness)
  return n.toFixed(2);
}

function clampCents(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function storageKey(userId: string | null) {
  return `keystone_budget_v1:${userId ?? "anon"}`;
}

const DEFAULT_BUDGET: BudgetState = {
  monthly_income_cents: 0,
  fixed_bills_cents: 0,
  buckets: [
    { id: "groceries", name: "Groceries", amount_cents: 0 },
    { id: "fuel", name: "Fuel", amount_cents: 0 },
    { id: "kids", name: "Kids", amount_cents: 0 },
    { id: "savings", name: "Savings", amount_cents: 0 },
  ],
  updated_at_iso: new Date().toISOString(),
};

export default function BudgetPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [state, setState] = useState<BudgetState>(DEFAULT_BUDGET);

  // add bucket UI
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // ---- boot ----
  useEffect(() => {
    let mounted = true;

    (async () => {
      setStatusLine("Loading…");

      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authError || !auth?.user) {
        setUserId(null);
        // still usable without auth (local only)
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(null)) : null;
        if (raw) {
          try {
            setState(JSON.parse(raw));
          } catch {
            setState(DEFAULT_BUDGET);
          }
        }
        setStatusLine("Not signed in.");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      // load from local storage (per-user on this device)
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(uid)) : null;
      if (raw) {
        try {
          setState(JSON.parse(raw));
          setStatusLine("Loaded.");
          return;
        } catch {
          // fall through
        }
      }

      setState(DEFAULT_BUDGET);
      setStatusLine("Loaded.");
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ---- persist (device-local for V1) ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = storageKey(userId);
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...state, updated_at_iso: new Date().toISOString() }));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, userId]);

  const bucketsTotal = useMemo(() => {
    return state.buckets.reduce((sum, b) => sum + (b.amount_cents ?? 0), 0);
  }, [state.buckets]);

  const availableAfterBills = useMemo(() => {
    return clampCents(state.monthly_income_cents - state.fixed_bills_cents);
  }, [state.monthly_income_cents, state.fixed_bills_cents]);

  const remaining = useMemo(() => {
    return clampCents(availableAfterBills - bucketsTotal);
  }, [availableAfterBills, bucketsTotal]);

  const updateIncome = (raw: string) => {
    setState((prev) => ({ ...prev, monthly_income_cents: clampCents(toCents(raw)) }));
  };

  const updateBills = (raw: string) => {
    setState((prev) => ({ ...prev, fixed_bills_cents: clampCents(toCents(raw)) }));
  };

  const updateBucket = (id: string, patch: Partial<Bucket>) => {
    setState((prev) => ({
      ...prev,
      buckets: prev.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };

  const deleteBucket = (id: string) => {
    setState((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((b) => b.id !== id),
    }));
  };

  const addBucket = () => {
    const name = newName.trim();
    if (!name) return;

    const amount_cents = clampCents(toCents(newAmount || "0"));

    setState((prev) => ({
      ...prev,
      buckets: [{ id: uid(), name, amount_cents }, ...prev.buckets],
    }));

    setNewName("");
    setNewAmount("");
  };

  return (
    <Page
      title="Budget"
      subtitle="A simple monthly plan: income, fixed bills, and buckets."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => setState(DEFAULT_BUDGET)} title="Reset this page to defaults on this device">
            Reset
          </Chip>
          <Chip
            onClick={() => {
              // force-save pulse
              setState((prev) => ({ ...prev, updated_at_iso: new Date().toISOString() }));
              setStatusLine("Saved.");
              window.setTimeout(() => setStatusLine("Loaded."), 1200);
            }}
            title="Save on this device"
          >
            Save
          </Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {/* Snapshot */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-zinc-900">Monthly snapshot</div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Monthly income</div>
                  <input
                    inputMode="decimal"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    value={fromCents(state.monthly_income_cents)}
                    onChange={(e) => updateIncome(e.target.value)}
                    placeholder="0.00"
                    aria-label="Monthly income"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Fixed bills (monthly)</div>
                  <input
                    inputMode="decimal"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    value={fromCents(state.fixed_bills_cents)}
                    onChange={(e) => updateBills(e.target.value)}
                    placeholder="0.00"
                    aria-label="Fixed bills"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="grid gap-2 text-sm text-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600">Available after bills</span>
                    <span className="font-semibold">{fromCents(availableAfterBills)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600">Buckets planned</span>
                    <span className="font-semibold">{fromCents(bucketsTotal)}</span>
                  </div>
                  <div className="h-px bg-zinc-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600">Remaining</span>
                    <span className="font-semibold">{fromCents(remaining)}</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                This page saves to this device for now. (We can move it into Supabase once the budget table is in.)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buckets */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Buckets</div>
                <div className="text-xs text-zinc-500">{state.updated_at_iso ? `Updated ${new Date(state.updated_at_iso).toLocaleDateString()}` : ""}</div>
              </div>

              {/* Add bucket */}
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Add a bucket (e.g., Groceries)"
                  aria-label="New bucket name"
                />
                <input
                  inputMode="decimal"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0.00"
                  aria-label="New bucket amount"
                />
                <Chip onClick={addBucket} title="Add bucket">
                  Add
                </Chip>
              </div>

              {state.buckets.length === 0 ? (
                <div className="text-sm text-zinc-600">No buckets yet.</div>
              ) : (
                <div className="space-y-2">
                  {state.buckets.map((b) => (
                    <div key={b.id} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <input
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                          value={b.name}
                          onChange={(e) => updateBucket(b.id, { name: e.target.value })}
                          aria-label={`Bucket name ${b.name}`}
                        />
                      </div>

                      <div className="sm:w-[160px]">
                        <input
                          inputMode="decimal"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                          value={fromCents(b.amount_cents)}
                          onChange={(e) => updateBucket(b.id, { amount_cents: clampCents(toCents(e.target.value)) })}
                          aria-label={`Bucket amount ${b.name}`}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Chip
                          className="border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                          onClick={() => deleteBucket(b.id)}
                          title="Remove this bucket"
                        >
                          Remove
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-zinc-500">
                Tip: keep buckets small and boring. The goal is a plan you can actually follow.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
