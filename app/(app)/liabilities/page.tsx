// app/(app)/liabilities/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip, Money, useToast } from "@/components/ui";
import { useCountUp } from "@/lib/ui/useCountUp";

export const dynamic = "force-dynamic";

type Liability = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number; // owed amount, stored positive
  currency: string;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

function toCents(input: string) {
  // accepts "1234.56" or "$1,234.56"
  const cleaned = input.replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function normCurrency(input: string) {
  const v = input.trim().toUpperCase();
  if (!v) return "AUD";
  // keep simple: 3-letter code expected
  return v.slice(0, 3);
}

// useCountUp can't be called inside a .map() callback (hooks rule) --
// this wraps it so each animated figure is its own component instance,
// same pattern as Money Map/Year. Scoped to the total-owed-by-currency
// line -- not the per-debt list rows.
function AnimatedMoney({ cents, currency }: { cents: number; currency: string }) {
  const animated = useCountUp(cents);
  return <Money cents={Math.round(animated)} currency={currency} />;
}

export default function LiabilitiesPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Liability[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Add form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(""); // dollars string
  const [currency, setCurrency] = useState("AUD");
  const [notes, setNotes] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("AUD");
  const [editNotes, setEditNotes] = useState("");

  const saveTimer = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from("liabilities")
        .select("id,user_id,name,current_balance_cents,currency,notes,archived,created_at,updated_at")
        .eq("user_id", user.id)
        .order("archived", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setItems((data as Liability[]) ?? []);
    } catch (e: any) {
      toast({
        title: "Couldn’t load debts",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = useMemo(() => {
    return items.filter((x) => (showArchived ? true : !x.archived));
  }, [items, showArchived]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of visibleItems) {
      const cur = x.currency || "AUD";
      map.set(cur, (map.get(cur) ?? 0) + Number(x.current_balance_cents ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleItems]);

  async function add() {
    if (saving) return;

    const n = name.trim();
    if (!n) {
      toast({ title: "Name is required" });
      return;
    }

    const cents = toCents(amount);
    if (cents === null || cents < 0) {
      toast({ title: "Enter an amount owed" });
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not signed in.");

      const { error } = await supabase.from("liabilities").insert({
        user_id: user.id,
        name: n,
        current_balance_cents: cents,
        currency: normCurrency(currency),
        notes: notes.trim() || null,
        archived: false,
      });

      if (error) throw error;

      setName("");
      setAmount("");
      setCurrency("AUD");
      setNotes("");

      toast({ title: "Saved" });
      await load();
    } catch (e: any) {
      toast({
        title: "Couldn’t save",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(x: Liability) {
    setEditingId(x.id);
    setEditName(x.name ?? "");
    setEditAmount(((x.current_balance_cents ?? 0) / 100).toFixed(2));
    setEditCurrency(x.currency ?? "AUD");
    setEditNotes(x.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditAmount("");
    setEditCurrency("AUD");
    setEditNotes("");
  }

  async function saveEdit(id: string) {
    if (saving) return;

    const n = editName.trim();
    if (!n) {
      toast({ title: "Name is required" });
      return;
    }

    const cents = toCents(editAmount);
    if (cents === null || cents < 0) {
      toast({ title: "Enter an amount owed" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("liabilities")
        .update({
          name: n,
          current_balance_cents: cents,
          currency: normCurrency(editCurrency),
          notes: editNotes.trim() || null,
        })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Saved" });
      cancelEdit();
      await load();
    } catch (e: any) {
      toast({
        title: "Couldn’t save",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(id: string, archived: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("liabilities").update({ archived }).eq("id", id);
      if (error) throw error;

      toast({ title: archived ? "Archived" : "Restored" });
      await load();
    } catch (e: any) {
      toast({
        title: "Couldn’t update",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (saving) return;
    const ok = window.confirm("Permanently delete this debt?");
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("liabilities").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Deleted" });
      await load();
    } catch (e: any) {
      toast({
        title: "Couldn’t delete",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Debts" subtitle="What the household owes — captured calmly, without judgement.">
      <div className="space-y-4">
        {/* Add */}
        <Card>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-zinc-600">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mortgage, Car loan, Credit card"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm text-zinc-600">Amount owed</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 12500"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm text-zinc-600">Currency</label>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="AUD"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-600">Notes (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any detail you’ll want later (optional)"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">
                Tip: keep this simple — just the main debts you want Life CFO to keep in mind.
              </div>
              <Button onClick={add} disabled={saving}>
                Add debt
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters + totals */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Chip active={!showArchived} onClick={() => setShowArchived(false)}>
              Active
            </Chip>
            <Chip active={showArchived} onClick={() => setShowArchived(true)}>
              All (incl. archived)
            </Chip>
          </div>

          <div className="text-sm text-zinc-700">
            {totalsByCurrency.length === 0 ? null : (
              <span>
                Total owed:{" "}
                {totalsByCurrency.map(([cur, cents], idx) => (
                  <span key={cur}>
                    {idx ? " · " : ""}
                    <AnimatedMoney cents={cents} currency={cur} />
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : visibleItems.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-sm text-zinc-600">No debts added yet.</div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((x) => {
              const editing = editingId === x.id;

              return (
                <Card key={x.id}>
                  <CardContent className="space-y-3">
                    {!editing ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-medium text-zinc-900">
                              {x.name} {x.archived ? <span className="text-xs font-normal text-zinc-500">(archived)</span> : null}
                            </div>
                            {x.notes ? <div className="text-sm text-zinc-600">{x.notes}</div> : null}
                          </div>

                          <div className="shrink-0 text-sm font-medium text-zinc-900">
                            <Money cents={x.current_balance_cents ?? 0} currency={x.currency || "AUD"} />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button variant="secondary" onClick={() => startEdit(x)} disabled={saving}>
                            Edit
                          </Button>

                          {!x.archived ? (
                            <Button variant="ghost" onClick={() => setArchived(x.id, true)} disabled={saving}>
                              Archive
                            </Button>
                          ) : (
                            <Button variant="ghost" onClick={() => setArchived(x.id, false)} disabled={saving}>
                              Restore
                            </Button>
                          )}

                          <Button variant="ghost" onClick={() => remove(x.id)} disabled={saving}>
                            Delete
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm text-zinc-600">Name</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm text-zinc-600">Amount owed</label>
                            <input
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              inputMode="decimal"
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm text-zinc-600">Currency</label>
                            <input
                              value={editCurrency}
                              onChange={(e) => setEditCurrency(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm text-zinc-600">Notes (optional)</label>
                          <input
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                          <Button onClick={() => saveEdit(x.id)} disabled={saving}>
                            Save
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
