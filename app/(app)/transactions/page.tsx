// app/(app)/transactions/TransactionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Badge } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

type LiveState = "connecting" | "live" | "offline";

type Tx = {
  id: string;
  user_id: string;

  occurred_at: string | null;
  description: string;
  amount_cents: number;
  currency: string;

  account_id: string | null;
  merchant: string | null;
  category: string | null;
  notes: string | null;

  created_at: string | null;
  updated_at: string | null;
};

const LOAD_THROTTLE_MS = 1200;

function safeNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeDate(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function softWhen(iso: string | null | undefined) {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleDateString();
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

function signLabel(amountCents: number) {
  if (amountCents > 0) return "In";
  if (amountCents < 0) return "Out";
  return "Zero";
}

export default function TransactionsClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");

  const [items, setItems] = useState<Tx[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // local search (optional, separate to AssistedSearch)
  const [q, setQ] = useState("");

  // silent reload throttle
  const lastLoadAtRef = useRef<number>(0);
  const pendingSilentReloadRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedRefetchRef = useRef(false);
  const isMountedRef = useRef(true);

  async function load(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (silent) {
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) {
        if (pendingSilentReloadRef.current) window.clearTimeout(pendingSilentReloadRef.current);
        pendingSilentReloadRef.current = window.setTimeout(() => {
          pendingSilentReloadRef.current = null;
          void load(uid, { silent: true });
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
      const res = await supabase
        .from("transactions")
        .select("id,user_id,occurred_at,description,amount_cents,currency,account_id,merchant,category,notes,created_at,updated_at")
        .eq("user_id", uid)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(300);

      if (res.error) {
        setItems([]);
        setError(res.error.message);
        setStatusLine("Transactions needs setup (transactions).");
        return;
      }

      const normalized: Tx[] = (res.data ?? []).map((r: any) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        occurred_at: r.occurred_at ?? null,
        description: String(r.description ?? ""),
        amount_cents: safeNumber(r.amount_cents),
        currency: String(r.currency ?? "AUD"),
        account_id: r.account_id ?? null,
        merchant: r.merchant ?? null,
        category: r.category ?? null,
        notes: r.notes ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));

      setItems(normalized);
      setStatusLine(normalized.length ? "Loaded." : "No transactions yet.");
    } catch (e: any) {
      setError(e?.message ?? "Load failed.");
      setStatusLine("Load failed.");
    } finally {
      inFlightRef.current = false;

      if (!isMountedRef.current) return;
      if (queuedRefetchRef.current) {
        queuedRefetchRef.current = false;
        void load(uid, { silent: true });
      }
    }
  }

  // boot
  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        setLive("offline");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);
      await load(uid);
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime
  useEffect(() => {
    if (!userId) return;

    setLive("connecting");

    const ch = supabase
      .channel(`transactions_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, () =>
        void load(userId, { silent: true })
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
        else setLive("connecting");
      });

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  // focus refresh
  useEffect(() => {
    const onFocus = () => {
      if (!userId) return;
      void load(userId, { silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const monthTotal = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    return items.reduce((sum, t) => {
      const d = safeDate(t.occurred_at);
      if (!d) return sum;
      if (d.getFullYear() !== y || d.getMonth() !== m) return sum;
      return sum + safeNumber(t.amount_cents);
    }, 0);
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((t) => {
      const hay = [t.description, t.merchant ?? "", t.category ?? "", t.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  const LIMIT = 5;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? filtered : filtered.slice(0, LIMIT);
  const hidden = Math.max(0, filtered.length - visible.length);

  const right = (
    <div className="flex items-center gap-2">
      <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>
      {userId ? (
        <Chip onClick={() => void load(userId)} title="Refresh">
          Refresh
        </Chip>
      ) : null}
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page title="Transactions" subtitle="Read-only inputs for orientation. Calm, not accounting." right={right}>
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <AssistedSearch scope="transactions" placeholder="Search transactions…" />

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {error ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-sm font-semibold text-zinc-900">Setup needed</div>
              <div className="mt-1 text-sm text-zinc-600">Keystone can’t read transactions yet.</div>
              <div className="mt-2 text-xs text-zinc-500">{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {items.length > 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-zinc-900">This month</div>
                  <div className="text-xs text-zinc-500">A quiet picture (no chart).</div>
                </div>
                <div className="text-sm font-semibold text-zinc-900">{formatMoneyFromCents(monthTotal, "AUD")}</div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">List</div>
              <div className="text-xs text-zinc-500">{items.length} total</div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Filter locally…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q.trim() ? (
                <Chip onClick={() => setQ("")} title="Clear">
                  Clear
                </Chip>
              ) : null}
              {filtered.length > LIMIT ? (
                <Chip onClick={() => setShowAll((v) => !v)} title="Toggle list length">
                  {showAll ? "Show less" : "Show all"}
                </Chip>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2">
              {visible.length === 0 ? (
                <div className="text-sm text-zinc-600">Nothing here yet.</div>
              ) : (
                visible.map((t) => {
                  const isOpen = openId === t.id;
                  const amtAbs = Math.abs(t.amount_cents);

                  return (
                    <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : t.id)}
                        className="w-full text-left"
                        aria-expanded={isOpen}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-[240px] flex-1">
                            <div className="text-sm font-semibold text-zinc-900">{t.description || "Transaction"}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {t.merchant ? t.merchant : "—"}
                              {t.category ? ` • ${t.category}` : ""}
                              {t.occurred_at ? ` • ${softWhen(t.occurred_at)}` : ""}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge>{signLabel(t.amount_cents)}</Badge>
                              <Chip title="Amount">{formatMoneyFromCents(amtAbs, t.currency || "AUD")}</Chip>
                              {t.updated_at ? <Chip title="Updated">{softWhen(t.updated_at)}</Chip> : null}
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-zinc-900">
                            {t.amount_cents < 0 ? "− " : t.amount_cents > 0 ? "+ " : ""}
                            {formatMoneyFromCents(amtAbs, t.currency || "AUD")}
                          </div>
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="mt-3 space-y-2">
                          {t.notes ? (
                            <div className="whitespace-pre-wrap text-sm text-zinc-700">{t.notes}</div>
                          ) : (
                            <div className="text-sm text-zinc-600">No notes.</div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-1">
                            <Chip onClick={() => setOpenId(null)}>Done</Chip>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}

              {hidden > 0 ? <div className="text-xs text-zinc-500">{hidden} more hidden — use search to find anything.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>This page is intentionally quiet: it’s for orientation, not bookkeeping.</div>
              <div>Later: connect transactions to Accounts and use them to generate calm Home signals.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
