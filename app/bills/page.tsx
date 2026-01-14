"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

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
  // Accepts: "12", "12.3", "12.30", "$12.30"
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
  // ISO -> "YYYY-MM-DDTHH:mm" in local time (for <input type="datetime-local" />)
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
  // "YYYY-MM-DDTHH:mm" (local) -> ISO
  const d = new Date(localValue);
  return d.toISOString();
}

export default function BillsPage() {
  const { showToast } = useToast();

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [nextDueLocal, setNextDueLocal] = useState(() => {
    // default: tomorrow 9am local
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalInputValue(d.toISOString());
  });
  const [autopay, setAutopay] = useState(false);
  const [active, setActive] = useState(true);

  // Inline edit drafts: id -> partial draft
  const [drafts, setDrafts] = useState<
    Record<string, Partial<RecurringBill> & { amount_input?: string; next_due_local?: string }>
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
      await loadBills(data.user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBills(uid: string) {
    const { data, error } = await supabase
      .from("recurring_bills")
      .select("*")
      .eq("user_id", uid)
      .order("active", { ascending: false })
      .order("next_due_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    setBills((data || []) as RecurringBill[]);
  }

  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);

  const nextDueSoon = useMemo(() => {
    const now = Date.now();
    const in14 = now + 14 * 24 * 60 * 60 * 1000;
    return activeBills.filter((b) => {
      const t = new Date(b.next_due_at).getTime();
      return t >= now && t <= in14;
    });
  }, [activeBills]);

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
      setAutopay(false);
      setActive(true);

      notify({ title: "Saved", description: "Recurring bill added." });
      await loadBills(userId);
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

      if (typeof d.amount_input === "string") {
        updatePayload.amount_cents = centsFromInput(d.amount_input);
      } else if (typeof d.amount_cents === "number") {
        updatePayload.amount_cents = d.amount_cents;
      }

      if (typeof d.next_due_local === "string") {
        updatePayload.next_due_at = fromLocalInputValue(d.next_due_local);
      }

      const { error } = await supabase
        .from("recurring_bills")
        .update(updatePayload)
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;

      notify({ title: "Saved", description: "Bill updated." });
      cancelEdit(id);
      await loadBills(userId);
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

    // optimistic
    setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: newValue } : x)));

    try {
      const { error } = await supabase
        .from("recurring_bills")
        .update({ active: newValue })
        .eq("id", b.id)
        .eq("user_id", userId);

      if (error) throw error;

      notify({
        title: newValue ? "Active" : "Paused",
        description: `"${b.name}" is now ${newValue ? "active" : "paused"}.`,
      });
    } catch (e: any) {
      // revert
      setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: previous } : x)));
      notify({ title: "Error", description: e?.message ?? "Failed to toggle." });
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
        // restore UI immediately
        setBills(snapshot);

        // best-effort re-insert (new id will be created)
        try {
          const payload = {
            user_id: userId,
            name: b.name,
            amount_cents: b.amount_cents,
            currency: b.currency,
            cadence: b.cadence,
            next_due_at: b.next_due_at,
            autopay: b.autopay,
            active: b.active,
          };

          const { error } = await supabase.from("recurring_bills").insert(payload);
          if (error) throw error;

          await loadBills(userId);
          showToast({ message: "Restored." });
        } catch (e: any) {
          showToast({ message: e?.message ?? "Failed to restore." });
        }
      },
    });

    const { error } = await supabase
      .from("recurring_bills")
      .delete()
      .eq("id", b.id)
      .eq("user_id", userId);

    if (error) {
      setBills(snapshot);
      showToast({ message: error.message });
    }
  }

  return (
    <Page title="Bills" subtitle="Recurring bills you’ve told Keystone are true. Used by the Engine later.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge>Active: {activeBills.length}</Badge>
                <Badge>Due in 14d: {nextDueSoon.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {loading ? <Chip>Loading…</Chip> : <Chip>{bills.length} total</Chip>}
                {error ? <Chip>{error}</Chip> : null}
              </div>
            </div>
          </CardContent>
        </Card>

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
                <div className="text-sm mb-1 opacity-70">Next due</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  type="datetime-local"
                  value={nextDueLocal}
                  onChange={(e) => setNextDueLocal(e.target.value)}
                />
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

        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="font-semibold">Your recurring bills</div>
              <div className="text-sm opacity-70">Stored as cents. Keystone doesn’t guess — it only reminds.</div>
            </div>

            <div className="grid gap-2">
              {bills.length === 0 ? (
                <div className="opacity-70 text-sm">No bills yet.</div>
              ) : (
                bills.map((b) => {
                  const editing = !!drafts[b.id];
                  const d = drafts[b.id];

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
                              </div>
                              <div className="text-sm opacity-75 mt-1">
                                {formatMoneyFromCents(b.amount_cents, b.currency)} • Next due{" "}
                                {new Date(b.next_due_at).toLocaleString()}
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
                                      [b.id]: { ...prev[b.id], name: e.target.value },
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
                                      [b.id]: { ...prev[b.id], amount_input: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div>
                                <div className="text-xs opacity-70 mb-1">Cadence</div>
                                <select
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  value={(d?.cadence as Cadence) ?? b.cadence}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [b.id]: { ...prev[b.id], cadence: e.target.value as Cadence },
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
                                <div className="text-xs opacity-70 mb-1">Next due</div>
                                <input
                                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                                  type="datetime-local"
                                  value={String(d?.next_due_local ?? toLocalInputValue(b.next_due_at))}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [b.id]: { ...prev[b.id], next_due_local: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div className="md:col-span-6 flex items-center gap-4 flex-wrap">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!d?.autopay}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [b.id]: { ...prev[b.id], autopay: e.target.checked },
                                      }))
                                    }
                                  />
                                  Autopay
                                </label>

                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!d?.active}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [b.id]: { ...prev[b.id], active: e.target.checked },
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
                              <Button onClick={() => toggleActive(b)} disabled={saving}>
                                {b.active ? "Pause" : "Activate"}
                              </Button>
                              <Button onClick={() => beginEdit(b)} disabled={saving}>
                                Edit
                              </Button>
                              <Button onClick={() => deleteBill(b)} disabled={saving}>
                                Delete
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button onClick={() => saveEdit(b.id)} disabled={saving}>
                                Save
                              </Button>
                              <Button onClick={() => cancelEdit(b.id)} disabled={saving}>
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
