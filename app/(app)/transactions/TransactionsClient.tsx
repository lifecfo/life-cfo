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
  provider: string | null;
  type: string | null;
  status: string | null;
  archived: boolean | null;
  currency: string | null;
  current_balance_cents: number | null;
  updated_at: string | null;
  created_at: string | null;
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

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYmd(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export const dynamic = "force-dynamic";

type RangePreset = "7d" | "30d" | "90d" | "all" | "custom";
type PendingFilter = "all" | "pending" | "posted";
type DirectionFilter = "all" | "in" | "out";

export default function TransactionsClient() {
  const router = useRouter();

  const [statusLine, setStatusLine] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");

  const [items, setItems] = useState<Tx[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // Accounts for filter dropdown
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Filters (server-backed)
  const [accountId, setAccountId] = useState<string>("all");
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [from, setFrom] = useState<string>(addDaysYmd(-30));
  const [to, setTo] = useState<string>(todayYmd());
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  const [direction, setDirection] = useState<DirectionFilter>("all");

  // Local filter (client-only quick needle)
  const [q, setQ] = useState("");

  const isMountedRef = useRef(true);

  // Keep from/to in sync with preset unless custom
  useEffect(() => {
    if (rangePreset === "custom") return;

    if (rangePreset === "all") {
      setFrom("");
      setTo("");
      return;
    }

    const days = rangePreset === "7d" ? -7 : rangePreset === "30d" ? -30 : -90;
    setFrom(addDaysYmd(days));
    setTo(todayYmd());
  }, [rangePreset]);

  function buildApiUrl(limit = 250) {
    const url = new URL("/api/money/transactions", window.location.origin);
    url.searchParams.set("limit", String(limit));

    if (accountId !== "all") url.searchParams.set("account_id", accountId);
    if (rangePreset !== "all") {
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
    }

    if (pendingFilter === "pending") url.searchParams.set("pending", "true");
    if (pendingFilter === "posted") url.searchParams.set("pending", "false");

    return url.pathname + url.search;
  }

  async function load(silent = false) {
    if (!silent) {
      setStatusLine("Loading…");
      setError(null);
      setLive("connecting");
    }

    try {
      const json = await fetchJson<{ ok: boolean; transactions: Tx[] }>(buildApiUrl(250));
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

  async function loadAccountsOnce() {
    if (accountsLoaded) return;
    setAccountsLoaded(true);

    try {
      const json = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>("/api/money/accounts");
      if (!isMountedRef.current) return;

      const rows = (json.accounts ?? []).filter((a) => !a.archived);
      setAccounts(rows);
    } catch {
      // non-fatal: account filter will just show "All accounts"
      setAccounts([]);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    void loadAccountsOnce();
    void load(false);
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when server-backed filters change
  useEffect(() => {
    if (!isMountedRef.current) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, rangePreset, from, to, pendingFilter]);

  // Focus refresh (silent)
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
    let next = items;

    // Direction filter is client-side (based on sign)
    if (direction !== "all") {
      next = next.filter((t) => {
        const cents =
          typeof t.amount_cents === "number"
            ? t.amount_cents
            : typeof t.amount === "number"
            ? Math.round(t.amount * 100)
            : 0;

        return direction === "in" ? cents > 0 : cents < 0;
      });
    }

    const needle = q.trim().toLowerCase();
    if (!needle) return next;

    return next.filter((t) => {
      const hay = [t.description ?? "", t.merchant ?? "", t.category ?? "", t.date ?? "", t.currency ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, direction]);

  const LIMIT = 20;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? filtered : filtered.slice(0, LIMIT);
  const hidden = Math.max(0, filtered.length - visible.length);

  const right = (
    <div className="flex items-center gap-2">
      <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>
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

        {/* Filter bar */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Filters</div>
                <div className="text-xs text-zinc-500">Tight and quiet. Use this to narrow the feed.</div>
              </div>
              <Chip
                title="Reset"
                onClick={() => {
                  setAccountId("all");
                  setRangePreset("30d");
                  setPendingFilter("all");
                  setDirection("all");
                  setQ("");
                  setShowAll(false);
                  setOpenId(null);
                }}
              >
                Reset
              </Chip>
            </div>

            <div className="mt-3 grid gap-2">
              {/* Row 1 */}
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Account</div>
                  <select
                    className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="all">All accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || "Untitled account"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Range</div>
                  <select
                    className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    value={rangePreset}
                    onChange={(e) => setRangePreset(e.target.value as RangePreset)}
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="all">All time</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Pending</div>
                  <select
                    className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    value={pendingFilter}
                    onChange={(e) => setPendingFilter(e.target.value as PendingFilter)}
                  >
                    <option value="all">All</option>
                    <option value="posted">Posted</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Direction</div>
                  <select
                    className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as DirectionFilter)}
                  >
                    <option value="all">All</option>
                    <option value="out">Out</option>
                    <option value="in">In</option>
                  </select>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 sm:col-span-2">
                  <div className="text-[11px] text-zinc-500">Quick filter</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                      placeholder="Type to filter what’s already loaded…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    {q.trim() ? <Chip onClick={() => setQ("")}>Clear</Chip> : null}
                  </div>
                </div>
              </div>

              {/* Custom date controls */}
              {rangePreset === "custom" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-zinc-500">From</div>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-zinc-500">To</div>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              {filtered.length} shown
              {items.length !== filtered.length ? ` (from ${items.length} loaded)` : ""}
              {accountId !== "all" ? " • account scoped" : ""}
              {rangePreset !== "all" ? " • range scoped" : ""}
              {pendingFilter !== "all" ? " • pending scoped" : ""}
              {direction !== "all" ? " • direction filtered" : ""}
            </div>
          </CardContent>
        </Card>

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
              <div className="text-xs text-zinc-500">{items.length} loaded</div>
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

                  const amountText =
                    typeof t.amount_cents === "number"
                      ? formatMoneyFromCents(abs, cur)
                      : typeof t.amount === "number"
                      ? formatMoneyFromAmount(Math.abs(t.amount), cur)
                      : formatMoneyFromCents(0, cur);

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
                              <Chip title="Amount">{amountText}</Chip>
                              {t.updated_at ? <Chip title="Updated">{softWhen(t.updated_at)}</Chip> : null}
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-zinc-900">
                            {cents < 0 ? "− " : cents > 0 ? "+ " : ""}
                            {amountText}
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

              {filtered.length > LIMIT ? (
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-zinc-500">{hidden > 0 ? `${hidden} more hidden — use filters/search.` : ""}</div>
                  <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>This page is intentionally quiet: it’s for orientation, not bookkeeping.</div>
              <div>Later: saved views, export, and rules.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}