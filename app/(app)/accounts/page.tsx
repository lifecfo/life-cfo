// app/(app)/accounts/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, CardContent, Badge, Chip, useToast } from "@/components/ui";
import { Page } from "@/components/Page";
import { AssistedSearch } from "@/components/AssistedSearch";

type LiveState = "connecting" | "live" | "offline";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  archived?: boolean;
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
    return `${currency} ${value.toFixed(2)}`;
  }
}

const LOAD_THROTTLE_MS = 1500;

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

export default function AccountsPage() {
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

  const [statusLine, setStatusLine] = useState("Loading...");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [live, setLive] = useState<LiveState>("connecting");
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

  // Search + calm visibility limit (kept for V1)
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_LIMIT = 5;

  // Silent reload throttle
  const lastLoadAtRef = useRef<number>(0);
  const pendingSilentReloadRef = useRef<number | null>(null);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (silent) {
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) {
        if (pendingSilentReloadRef.current) window.clearTimeout(pendingSilentReloadRef.current);
        pendingSilentReloadRef.current = window.setTimeout(() => {
          pendingSilentReloadRef.current = null;
          load({ silent: true });
        }, LOAD_THROTTLE_MS);
        return;
      }
    }

    if (!silent) setStatusLine("Loading...");
    lastLoadAtRef.current = now;

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      if (!silent) setStatusLine(`Auth error: ${authError.message}`);
      setUserId(null);
      return;
    }

    const user = auth.user;
    if (!user) {
      if (!silent) setStatusLine("Not signed in. Go to /auth/login");
      setUserId(null);
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("accounts")
      .select("id,user_id,name,current_balance_cents,currency,archived,created_at,updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (!silent) setStatusLine(`Error: ${error.message}`);
      return;
    }

    const list = (data ?? []) as Account[];
    setRows(list);
    if (!silent) setStatusLine(`Loaded ${list.length} account(s).`);

    // seed edit drafts (only if not already set)
    setEditName((prev) => {
      const next = { ...prev };
      for (const a of list) if (next[a.id] == null) next[a.id] = a.name ?? "";
      return next;
    });

    setEditBalance((prev) => {
      const next = { ...prev };
      for (const a of list) {
        if (next[a.id] == null) next[a.id] = ((a.current_balance_cents ?? 0) / 100).toFixed(2);
      }
      return next;
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus refresh (silent)
  useEffect(() => {
    const onFocus = () => {
      load({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime patching (user-scoped)
  useEffect(() => {
    if (!userId) return;

    setLive("connecting");

    const channel = supabase
      .channel(`accounts:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` }, (payload) => {
        try {
          const evt = payload.eventType;

          if (evt === "INSERT") {
            const row = payload.new as Account;
            setRows((prev) => {
              if (prev.some((x) => x.id === row.id)) return prev;
              return [row, ...prev];
            });
            setEditName((prev) => (prev[row.id] == null ? { ...prev, [row.id]: row.name ?? "" } : prev));
            setEditBalance((prev) =>
              prev[row.id] == null ? { ...prev, [row.id]: ((row.current_balance_cents ?? 0) / 100).toFixed(2) } : prev
            );
            return;
          }

          if (evt === "UPDATE") {
            const row = payload.new as Account;
            setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
            return;
          }

          if (evt === "DELETE") {
            const oldRow = payload.old as { id: string };
            setRows((prev) => prev.filter((x) => x.id !== oldRow.id));
            return;
          }

          load({ silent: true });
        } catch {
          load({ silent: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const totalBalanceCents = useMemo(() => rows.reduce((sum, a) => sum + (a.current_balance_cents ?? 0), 0), [rows]);

  const filteredRows = useMemo(() => {
    const q = norm(query);
    if (!q) return rows;

    return rows.filter((a) => {
      const hay = `${a.name ?? ""} ${a.currency ?? ""} ${a.id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const visibleRows = useMemo(() => {
    const q = norm(query);
    if (q) return filteredRows; // when searching, show matches (recognition-first)
    if (showAll) return filteredRows;
    return filteredRows.slice(0, VISIBLE_LIMIT);
  }, [filteredRows, query, showAll]);

  const hiddenCount = useMemo(() => {
    const q = norm(query);
    if (q) return 0;
    if (showAll) return 0;
    return Math.max(0, filteredRows.length - visibleRows.length);
  }, [filteredRows.length, visibleRows.length, query, showAll]);

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
      .select("id,user_id,name,current_balance_cents,currency,archived,created_at,updated_at")
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

    const snapshot = rows;
    setDeletingRow((prev) => ({ ...prev, [a.id]: true }));
    setStatusLine("Deleting...");

    // Optimistic UI remove
    setRows((prev) => prev.filter((x) => x.id !== a.id));

    showToast({
      message: `"${a.name}" deleted.`,
      undoLabel: "Undo",
      onUndo: async () => {
        // Restore UI immediately
        setRows(snapshot);

        // Restore DB (try same id)
        try {
          const { error: insErr } = await supabase.from("accounts").insert({
            id: a.id,
            user_id: a.user_id,
            name: a.name,
            current_balance_cents: a.current_balance_cents ?? 0,
            currency: a.currency ?? "AUD",
            archived: (a as any).archived ?? false,
          } as any);

          if (insErr) throw insErr;

          await load({ silent: true });
          showToast({ message: "Restored." });
        } catch (e: any) {
          showToast({ message: e?.message ?? "Failed to restore." });
        }
      },
    });

    const { error } = await supabase.from("accounts").delete().eq("id", a.id).eq("user_id", userId);

    setDeletingRow((prev) => ({ ...prev, [a.id]: false }));

    if (error) {
      // revert UI
      setRows(snapshot);
      setStatusLine(`Delete failed: ${error.message}`);
      showToast({ message: error.message });
      return;
    }

    setStatusLine("Deleted ✅");
  };

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const liveChip = <Chip className={`ml-2 ${liveChipClass}`}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>;

  return (
    <Page
      title="Accounts"
      subtitle={[email ? `Signed in as: ${email}` : null, `Total balance: ${formatMoney(totalBalanceCents, "AUD")}`, statusLine].filter(Boolean).join(" • ")}
      right={
        <div className="flex items-center gap-2">
          {liveChip}
          <Button onClick={() => load()} variant="secondary">
            Refresh
          </Button>
        </div>
      }
    >
      {/* Assisted search (top) */}
      <Card>
        <CardContent>
          <AssistedSearch scope="accounts" placeholder="Search accounts…" />
        </CardContent>
      </Card>

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

        {/* (Optional) Local filter + visibility limit */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold">List</div>
              <div className="text-sm opacity-70">Showing a small set by default. Use search to find anything.</div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowAll(false);
                }}
                placeholder="Filter this page…"
                className="min-w-[260px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />

              {query ? (
                <Chip
                  onClick={() => {
                    setQuery("");
                    setShowAll(false);
                  }}
                  title="Clear filter"
                >
                  Clear
                </Chip>
              ) : (
                <Chip onClick={() => setShowAll((v) => !v)} title="Show more or less">
                  {showAll ? "Show less" : "Show all"}
                </Chip>
              )}

              <Badge variant="muted">{query ? `${filteredRows.length} match(es)` : `${visibleRows.length}/${rows.length} shown`}</Badge>
            </div>

            {!query && hiddenCount > 0 ? <div className="mt-3 text-sm text-zinc-600">{hiddenCount} more hidden — use search to find anything.</div> : null}
          </CardContent>
        </Card>

        {/* List */}
        <div className="grid gap-3">
          {visibleRows.map((a) => {
            const saving = !!savingRow[a.id];
            const deleting = !!deletingRow[a.id];
            const changed =
              (editName[a.id] ?? "").trim() !== a.name || toCents((editBalance[a.id] ?? "").trim()) !== (a.current_balance_cents ?? 0);

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

          {rows.length > 0 && visibleRows.length === 0 && (
            <Card className="bg-zinc-50">
              <CardContent>
                <div className="space-y-2">
                  <strong>No results.</strong>
                  <div className="text-sm text-zinc-600">Try a different search term.</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
