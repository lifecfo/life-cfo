"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fromLocalInputValue(localValue: string) {
  const d = new Date(localValue);
  return d.toISOString();
}

export default function IncomePage() {
  const { showToast } = useToast();

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<RecurringIncome[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add form
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

  // Inline edit drafts
  const [drafts, setDrafts] = useState<
    Record<string, Partial<RecurringIncome> & { amount_input?: string; next_pay_local?: string }>
  >({});

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

      setUserId(data.user.id);
      await loadIncome(data.user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadIncome(uid: string) {
    const { data, error } = await supabase
      .from("recurring_income")
      .select("*")
      .eq("user_id", uid)
      .order("active", { ascending: false })
      .order("next_pay_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    setItems((data || []) as RecurringIncome[]);
  }

  const activeIncome = useMemo(() => items.filter((i) => i.active), [items]);

  const nextPaySoon = useMemo(() => {
    const now = Date.now();
    const in14 = now + 14 * 24 * 60 * 60 * 1000;
    return activeIncome.filter((i) => {
      const t = new Date(i.next_pay_at).getTime();
      return t >= now && t <= in14;
    });
  }, [activeIncome]);

  async function addIncome() {
    if (!userId) return;

    const trimmed = name.trim();
    if (!trimmed) {
      notify({ title: "Add income", description: "Please enter an income name." });
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
        next_pay_at: fromLocalInputValue(nextPayLocal),
        active,
      };

      const { error } = await supabase.from("recurring_income").insert(payload);
      if (error) throw error;

      setName("");
      setAmount("");
      setCadence("fortnightly");
      setActive(true);

      notify({ title: "Saved", description: "Recurring income added." });
      await loadIncome(userId);
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Failed to add income." });
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(i: RecurringIncome) {
    setDrafts((prev) => ({
      ...prev,
      [i.id]: {
        ...i,
        amount_input: ((i.amount_cents || 0) / 100).toFixed(2),
        next_pay_local: toLocalInputValue(i.next_pay_at),
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
        active: !!d.active,
      };

      if (!updatePayload.name) {
        notify({ title: "Update", description: "Name can’t be empty." });
        setSaving(false);
        return;
      }

      if (typeof d.amount_input === "string") {
        updatePayload.amount_cents = centsFromInput(d.amount_input);
      } else if (typeof d.amount_cents === "number") {
        updatePayload.amount_cents = d.amount_cents;
      }

      if (typeof d.next_pay_local === "string") {
        updatePayload.next_pay_at = fromLocalInputValue(d.next_pay_local);
      }

      const { error } = await supabase
        .from("recurring_income")
        .update(updatePayload)
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;

      notify({ title: "Saved", description: "Income updated." });
      cancelEdit(id);
      await loadIncome(userId);
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Failed to update income." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(i: RecurringIncome) {
    if (!userId) return;

    const newValue = !i.active;
    const previous = i.active;

    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, active: newValue } : x)));

    try {
      const { error } = await supabase
        .from("recurring_income")
        .update({ active: newValue })
        .eq("id", i.id)
        .eq("user_id", userId);

      if (error) throw error;

      notify({
        title: newValue ? "Active" : "Paused",
        description: `"${i.name}" is now ${newValue ? "active" : "paused"}.`,
      });
    } catch (e: any) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, active: previous } : x)));
      notify({ title: "Error", description: e?.message ?? "Failed to toggle." });
    }
  }

  async function deleteIncome(i: RecurringIncome) {
    if (!userId) return;

    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== i.id));

    showToast({
      message: `"${i.name}" removed.`,
      undoLabel: "Undo",
      onUndo: async () => {
        setItems(snapshot);
        try {
          const payload = {
            user_id: userId,
            name: i.name,
            amount_cents: i.amount_cents,
            currency: i.currency,
            cadence: i.cadence,
            next_pay_at: i.next_pay_at,
            active: i.active,
          };
          const { error } = await supabase.from("recurring_income").insert(payload);
          if (error) throw error;

          await loadIncome(userId);
          showToast({ message: "Restored." });
        } catch (e: any) {
          showToast({ message: e?.message ?? "Failed to restore." });
        }
      },
    });

    const { error } = await supabase
      .from("recurring_income")
      .delete()
      .eq("id", i.id)
      .eq("user_id", userId);

    if (error) {
      setItems(snapshot);
      showToast({ message: error.message });
    }
  }

  return (
    <Page title="Income" subtitle="Recurring income you’ve told Keystone is true. Used by the Engine later.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge>Active: {activeIncome.length}</Badge>
                <Badge>Pay in 14d: {nextPaySoon.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {loading ? <Chip>Loading…</Chip> : <Chip>{items.length} total</Chip>}
                {error ? <Chip>{error}</Chip> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Add recurring income</div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-sm mb-1 opacity-70">Name</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="Wages, Family Tax Benefit, Rent income…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm mb-1 opacity-70">Amount (AUD)</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="e.g. 2400.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm mb-1 opacity-70">Cadence</div>
                <select
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as Cadence)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm mb-1 opacity-70">Next pay</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  type="datetime-local"
                  value={nextPayLocal}
                  onChange={(e) => setNextPayLocal(e.target.value)}
                />
              </div>

              <div className="md:col-span-6 flex items-center justify-between gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active
                </label>

                <Button disabled={saving || !userId} onClick={addIncome}>
                  {saving ? "Saving…" : "Add income"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="font-semibold">Your recurring income</div>
              <div className="text-sm opacity-70">Stored as cents. Keystone doesn’t guess — it only reminds.</div>
            </div>

            <div className="grid gap-2">
              {items.length === 0 ? (
                <div className="opacity-70 text-sm">No income items yet.</div>
              ) : (
                items.map((i) => {
                  const editing = !!drafts[i.id];
                  const d = drafts[i.id];

                  return (
                    <div key={i.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-[240px] flex-1">
                          {!editing ? (
                            <>
                              <div className="font-semibold flex items-center gap-2 flex-wrap">
                                {i.name}
                                {i.active ? <Badge>Active</Badge> : <Badge>Paused</Badge>}
                                <Chip>{i.cadence}</Chip>
                              </div>
                              <div className="text-sm opacity-75 mt-1">
                                {formatMoneyFromCents(i.amount_cents, i.currency)} • Next pay{" "}
                                {new Date(i.next_pay_at).toLocaleString()}
                              </div>
                            </>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-6">
                              <div className="md:col-span-2">
                                <div className="text-xs opacity-70 mb-1">Name</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={String(d?.name ?? "")}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [i.id]: { ...prev[i.id], name: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div>
                                <div className="text-xs opacity-70 mb-1">Amount</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={String(d?.amount_input ?? "")}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [i.id]: { ...prev[i.id], amount_input: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div>
                                <div className="text-xs opacity-70 mb-1">Cadence</div>
                                <select
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={(d?.cadence as Cadence) ?? i.cadence}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [i.id]: { ...prev[i.id], cadence: e.target.value as Cadence },
                                    }))
                                  }
                                >
                                  <option value="weekly">Weekly</option>
                                  <option value="fortnightly">Fortnightly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <div className="text-xs opacity-70 mb-1">Next pay</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  type="datetime-local"
                                  value={String(d?.next_pay_local ?? toLocalInputValue(i.next_pay_at))}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [i.id]: { ...prev[i.id], next_pay_local: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div className="md:col-span-6 flex items-center gap-4 flex-wrap">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!d?.active}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [i.id]: { ...prev[i.id], active: e.target.checked },
                                      }))
                                    }
                                  />
                                  Active
                                </label>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!editing ? (
                            <>
                              <Button onClick={() => toggleActive(i)} disabled={saving}>
                                {i.active ? "Pause" : "Activate"}
                              </Button>
                              <Button onClick={() => beginEdit(i)} disabled={saving}>
                                Edit
                              </Button>
                              <Button onClick={() => deleteIncome(i)} disabled={saving}>
                                Delete
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button onClick={() => saveEdit(i.id)} disabled={saving}>
                                Save
                              </Button>
                              <Button onClick={() => cancelEdit(i.id)} disabled={saving}>
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
