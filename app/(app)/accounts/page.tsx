"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, CardContent, Badge } from "@/components/ui";
import { Page } from "@/components/Page";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

function toCents(input: string) {
  const n = Number.parseFloat(input);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function formatMoney(cents: number, currency = "AUD") {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    // fallback if currency code is weird
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function AccountsPage() {
  const [statusLine, setStatusLine] = useState("Loading...");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<Account[]>([]);

  // create
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [creating, setCreating] = useState(false);

  // per-row edit drafts
  const [editName, setEditName] = useState<Record<string, string>>({});
  const [editBalance, setEditBalance] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<Record<string, boolean>>({});
  const [deletingRow, setDeletingRow] = useState<Record<string, boolean>>({});

  const load = async () => {
    setStatusLine("Loading...");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setStatusLine(`Auth error: ${authError.message}`);
      setUserId(null);
      return;
    }

    const user = auth.user;
    if (!user) {
      setStatusLine("Not signed in. Go to /auth/login");
      setUserId(null);
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("accounts")
      .select("id,user_id,name,current_balance_cents,currency,created_at,updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    setRows((data ?? []) as Account[]);
    setStatusLine(`Loaded ${data?.length ?? 0} account(s).`);

    // seed edit drafts (only if not already set)
    setEditName((prev) => {
      const next = { ...prev };
      for (const a of (data ?? []) as any[]) if (next[a.id] == null) next[a.id] = a.name ?? "";
      return next;
    });

    setEditBalance((prev) => {
      const next = { ...prev };
      for (const a of (data ?? []) as any[]) {
        if (next[a.id] == null) next[a.id] = ((a.current_balance_cents ?? 0) / 100).toFixed(2);
      }
      return next;
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBalanceCents = useMemo(() => rows.reduce((sum, a) => sum + (a.current_balance_cents ?? 0), 0), [rows]);

  const createAccount = async () => {
    if (!userId) return;

    const name = newName.trim();
    if (!name) {
      setStatusLine("Account name required.");
      return;
    }

    const cents = toCents(newBalance.trim() || "0");
    if (cents == null) {
      setStatusLine("Balance must be a number (e.g. 123.45).");
      return;
    }

    setCreating(true);
    setStatusLine("Creating account...");

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name,
        current_balance_cents: cents,
        currency: "AUD",
      })
      .select("id,user_id,name,current_balance_cents,currency,created_at,updated_at")
      .single();

    setCreating(false);

    if (error) {
      setStatusLine(`Create failed: ${error.message}`);
      return;
    }

    const inserted = data as Account;
    setRows((prev) => [inserted, ...prev]);
    setNewName("");
    setNewBalance("");

    setEditName((prev) => ({ ...prev, [inserted.id]: inserted.name }));
    setEditBalance((prev) => ({ ...prev, [inserted.id]: (inserted.current_balance_cents / 100).toFixed(2) }));

    setStatusLine("Created ✅");
  };

  const saveAccount = async (a: Account) => {
    if (!userId) return;

    const name = (editName[a.id] ?? "").trim();
    if (!name) {
      setStatusLine("Account name required.");
      return;
    }

    const cents = toCents((editBalance[a.id] ?? "").trim());
    if (cents == null) {
      setStatusLine("Balance must be a number (e.g. 123.45).");
      return;
    }

    setSavingRow((prev) => ({ ...prev, [a.id]: true }));
    setStatusLine("Saving...");

    const { error } = await supabase
      .from("accounts")
      .update({
        name,
        current_balance_cents: cents,
      })
      .eq("id", a.id)
      .eq("user_id", userId);

    setSavingRow((prev) => ({ ...prev, [a.id]: false }));

    if (error) {
      setStatusLine(`Save failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((x) => (x.id === a.id ? { ...x, name, current_balance_cents: cents } : x)));
    setStatusLine("Saved ✅");
  };

  const deleteAccount = async (a: Account) => {
    if (!userId) return;

    setDeletingRow((prev) => ({ ...prev, [a.id]: true }));
    setStatusLine("Deleting...");

    const { error } = await supabase.from("accounts").delete().eq("id", a.id).eq("user_id", userId);

    setDeletingRow((prev) => ({ ...prev, [a.id]: false }));

    if (error) {
      setStatusLine(`Delete failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.filter((x) => x.id !== a.id));
    setStatusLine("Deleted ✅");
  };

  return (
    <Page
      title="Accounts"
      subtitle={[
        email ? `Signed in as: ${email}` : null,
        `Total balance: ${formatMoney(totalBalanceCents, "AUD")}`,
        statusLine,
      ]
        .filter(Boolean)
        .join(" • ")}
      right={<Button onClick={load}>Refresh</Button>}
    >
      <div className="space-y-6">
        {/* Create */}
        <Card>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm text-zinc-600">Add an account</div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Everyday Spending"
                  className="min-w-[240px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <input
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="Balance (e.g. 1250.00)"
                  inputMode="decimal"
                  className="w-[220px] rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <Button onClick={createAccount} disabled={creating}>
                  {creating ? "Creating..." : "Add"}
                </Button>
              </div>

              <div className="text-xs text-zinc-500">Tip: keep balances roughly current — the Engine will use these.</div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div className="grid gap-3">
          {rows.map((a) => {
            const saving = !!savingRow[a.id];
            const deleting = !!deletingRow[a.id];
            const changed =
              (editName[a.id] ?? "").trim() !== a.name ||
              toCents((editBalance[a.id] ?? "").trim()) !== (a.current_balance_cents ?? 0);

            return (
              <Card key={a.id}>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base">{a.name}</strong>
                          <Badge variant="muted">{formatMoney(a.current_balance_cents ?? 0, a.currency ?? "AUD")}</Badge>
                          {changed && <Badge variant="warning">Unsaved</Badge>}
                        </div>
                        <div className="text-xs text-zinc-500">id: {a.id}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => saveAccount(a)} disabled={saving || deleting || !changed}>
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => deleteAccount(a)} disabled={saving || deleting}>
                          {deleting ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-xs text-zinc-500">Name</div>
                        <input
                          value={editName[a.id] ?? ""}
                          onChange={(e) => setEditName((prev) => ({ ...prev, [a.id]: e.target.value }))}
                          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs text-zinc-500">Balance</div>
                        <input
                          value={editBalance[a.id] ?? ""}
                          onChange={(e) => setEditBalance((prev) => ({ ...prev, [a.id]: e.target.value }))}
                          inputMode="decimal"
                          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {rows.length === 0 && (
            <Card className="bg-zinc-50">
              <CardContent>
                <div className="space-y-2">
                  <strong>No accounts yet.</strong>
                  <div className="text-sm text-zinc-600">Add at least one account to start calculating safe-to-spend.</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
