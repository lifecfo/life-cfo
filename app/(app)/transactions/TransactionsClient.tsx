// app/(app)/transactions/TransactionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Badge } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

type Tx = {
  id: string;
  date: string | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null;
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AccountRow = {
  id: string;
  name: string | null;
  archived: boolean | null;
  currency: string | null;
};

type LiveState = "connecting" | "live" | "offline";

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

function formatMoneyFromAmount(a: number, currency = "AUD") {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(a);
  } catch {
    return `${currency} ${a.toFixed(2)}`;
  }
}

function signLabel(amountCents: number) {
  if (amountCents > 0) return "In";
  if (amountCents < 0) return "Out";
  return "Zero";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export const dynamic = "force-dynamic";

type PendingFilter = "any" | "pending" | "cleared";

export default function TransactionsClient() {
  const router = useRouter();

  const [statusLine, setStatusLine] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");

  const [items, setItems] = useState<Tx[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // local text filter (separate to AssistedSearch)
  const [q, setQ] = useState("");

  // filter layer (server-backed)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [from, setFrom] = useState<string>(""); // YYYY-MM-DD
  const [to, setTo] = useState<string>(""); // YYYY-MM-DD
  const [pending, setPending] = useState<PendingFilter>("any");
  const [accountId, setAccountId] = useState<string>(""); // "" = any
  const [limit, setLimit] = useState<number>(200);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const isMountedRef = useRef(true);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", String(Math.min(Math.max(limit, 1), 250)));
    if (accountId) sp.set("account_id", accountId);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (pending === "pending") sp.set("pending", "true");
    if (pending === "cleared") sp.set("pending", "false");
    return sp.toString();
  }, [accountId, from, to, pending, limit]);

  async function load(silent = false) {
    if (!silent) {
      setStatusLine("Loading…");
      setError(null);
      setLive("connecting");
    }

    try {
      const json = await fetchJson<{ ok: boolean; transactions: Tx[] }>(
        `/api/money/transactions?${queryString}`
      );

      if (!isMountedRef.current) return;

      setItems((json.transactions ?? []) as Tx[]);
      setStatusLine((json.transactions?.length ?? 0) ? "Loaded." : "No transactions yet.");
      setLive("live");
    } catch (e: any) {
      if (!isMountedRef.current) return;
      setItems([]);
      setError(e?.message ?? "Couldn’t load transactions.");
      setStatusLine("Load failed.");
      setLive("offline");
    }
  }

  async function loadAccounts() {
    try {
      const json = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>(`/api/money/accounts`);
      setAccounts((json.accounts ?? []).filter((a) => !a.archived));
    } catch {
      // quiet
      setAccounts([]);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    void load(false);
    void loadAccounts();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-load when filter layer changes
  useEffect(() => {
    if (!isMountedRef.current) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  // focus refresh (silent)
  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const d = safeDate(t.date);
      if (!d) return sum;
      if (d.getFullYear() !== y || d.getMonth() !== m) return sum;

      if (typeof t.amount_cents === "number") return sum + t.amount_cents;
      if (typeof t.amount === "number") return sum + Math.round(t.amount * 100);
      return sum;
    }, 0);
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((t) => {
      const hay = [t.description ?? "", t.merchant ?? "", t.category ?? "", t.date ?? ""].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  const LIMIT = 20;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? filtered : filtered.slice(0, LIMIT);
  const hidden = Math.max(0, filtered.length - visible.length);

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (accountId) n++;
    if (from) n++;
    if (to) n++;
    if (pending !== "any") n++;
    if (limit !== 200) n++;
    return n;
  }, [accountId, from, to, pending, limit]);

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>

      <Chip onClick={() => setFiltersOpen((v) => !v)} title="Filters">
        Filters{activeFiltersCount ? ` • ${activeFiltersCount}` : ""}
      </Chip>

      <Chip onClick={() => void load(false)} title="Refresh">
        Refresh
      </Chip>

      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page title="Transactions" subtitle="Inputs only. Calm, not accounting." right={right}>
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <AssistedSearch scope="transactions" placeholder="Search transactions…" />

        {filtersOpen ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold text-zinc-900">Filters</div>
                <div className="flex items-center gap-2">
                  <Chip
                    onClick={() => {
                      setAccountId("");
                      setFrom("");
                      setTo("");
                      setPending("any");
                      setLimit(200);
                    }}
                    title="Clear filters"
                  >
                    Clear
                  </Chip>
                  <Chip onClick={() => setFiltersOpen(false)}>Done</Chip>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Account</div>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    <option value="">Any account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || "Untitled account"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Pending</div>
                  <select
                    value={pending}
                    onChange={(e) => setPending(e.target.value as PendingFilter)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    <option value="any">Any</option>
                    <option value="pending">Pending only</option>
                    <option value="cleared">Cleared only</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">From</div>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">To</div>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs text-zinc-500">Limit</div>
                  <select
                    value={String(limit)}
                    onChange={(e) => setLimit(Math.min(Math.max(Number(e.target.value), 1), 250))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="250">250</option>
                  </select>
                  <div className="text-[11px] text-zinc-500 mt-1">Filters are real (server-backed). Local search below is just for quick narrowing.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

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
              {q.trim() ? <Chip onClick={() => setQ("")}>Clear</Chip> : null}
              {filtered.length > LIMIT ? (
                <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2">
              {visible.length === 0 ? (
                <div className="text-sm text-zinc-600">Nothing here yet.</div>
              ) : (
                visible.map((t) => {
                  const isOpen = openId === t.id;

                  const cur = (t.currency || "AUD").toUpperCase();

                  const cents =
                    typeof t.amount_cents === "number"
                      ? t.amount_cents
                      : typeof t.amount === "number"
                      ? Math.round(t.amount * 100)
                      : 0;

                  const abs = Math.abs(cents);

                  const title = t.merchant || t.description || "Transaction";
                  const meta = [t.date ? softWhen(t.date) : null, t.category ? t.category : null, t.pending ? "Pending" : null]
                    .filter(Boolean)
                    .join(" • ");

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
                            <div className="text-sm font-semibold text-zinc-900">{title}</div>
                            <div className="mt-1 text-xs text-zinc-500">{meta || "—"}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge>{signLabel(cents)}</Badge>
                              <Chip title="Amount">{formatMoneyFromCents(abs, cur)}</Chip>
                              {t.updated_at ? <Chip title="Updated">{softWhen(t.updated_at)}</Chip> : null}
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-zinc-900">
                            {cents < 0 ? "− " : cents > 0 ? "+ " : ""}
                            {formatMoneyFromCents(abs, cur)}
                          </div>
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-sm text-zinc-600">No notes.</div>
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
              <div>Later: provider adapters will keep it live.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}