"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

type AccountRow = {
  id: string;
  name: string | null;
  provider: string | null;
  currency: string | null;
  current_balance_cents: number | null;
  archived: boolean | null;
  updated_at: string | null;
};

type TxRow = {
  id: string;
  date: string | null; // YYYY-MM-DD
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null; // numeric
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
};

type LiveState = "connecting" | "live" | "offline";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function moneyFromAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function softDate(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "";
  const ms = Date.parse(isoOrDate);
  if (!Number.isFinite(ms)) {
    const ms2 = Date.parse(isoOrDate + "T00:00:00Z");
    if (!Number.isFinite(ms2)) return "";
    return new Date(ms2).toLocaleDateString();
  }
  return new Date(ms).toLocaleDateString();
}

function softWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function MoneyClient() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<LiveState>("connecting");
  const [statusLine, setStatusLine] = useState("Loading…");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const [householdId, setHouseholdId] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [tx, setTx] = useState<TxRow[]>([]);
  const [q, setQ] = useState("");

  const [connecting, setConnecting] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);

  const filteredTx = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tx;

    return tx.filter((t) => {
      const hay = [safeStr(t.description), safeStr(t.merchant), safeStr(t.category), safeStr(t.date), safeStr(t.currency)]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [q, tx]);

  const totalBalance = useMemo(() => {
    const byCur = new Map<string, number>();
    for (const a of accounts) {
      if (a.archived) continue;
      const cur = safeStr(a.currency) || "AUD";
      const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
      byCur.set(cur, (byCur.get(cur) ?? 0) + cents);
    }
    return byCur;
  }, [accounts]);

  const newestAccountUpdatedAt = useMemo(() => {
    const dates = (accounts ?? [])
      .map((a) => a.updated_at)
      .filter(Boolean)
      .map((x) => Date.parse(String(x)))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => b - a);
    return dates.length ? new Date(dates[0]).toISOString() : null;
  }, [accounts]);

  const refresh = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLive("connecting");
      setStatusLine("Loading…");
    }

    try {
      const a = await fetchJson<{ ok: boolean; accounts: AccountRow[]; household_id?: string }>("/api/money/accounts");
      const t = await fetchJson<{ ok: boolean; transactions: TxRow[] }>("/api/money/transactions?limit=25");

      setAccounts(a.accounts ?? []);
      setTx(t.transactions ?? []);
      setHouseholdId(a.household_id ?? null);

      setLive("live");
      setStatusLine((t.transactions?.length ?? 0) || (a.accounts?.length ?? 0) ? "Updated." : "No money data yet.");
      setLastRefreshedAt(new Date().toISOString());
    } catch (e: any) {
      setLive("offline");
      setStatusLine("Offline.");
      if (!silent) showToast({ message: e?.message ?? "Couldn’t load money data." }, 2500);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setLive("connecting");
      setStatusLine("Loading…");

      try {
        const a = await fetchJson<{ ok: boolean; accounts: AccountRow[]; household_id?: string }>("/api/money/accounts");
        const t = await fetchJson<{ ok: boolean; transactions: TxRow[] }>("/api/money/transactions?limit=25");

        if (!alive) return;

        setAccounts(a.accounts ?? []);
        setTx(t.transactions ?? []);
        setHouseholdId(a.household_id ?? null);

        setLive("live");
        setStatusLine((t.transactions?.length ?? 0) || (a.accounts?.length ?? 0) ? "Updated." : "No money data yet.");
        setLastRefreshedAt(new Date().toISOString());
      } catch (e: any) {
        if (!alive) return;
        setLive("offline");
        setStatusLine("Offline.");
        showToast({ message: e?.message ?? "Couldn’t load money data." }, 2500);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showToast]);

  // Focus refresh (silent)
  useEffect(() => {
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd+K focuses the transactions quick-search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if (!isK) return;

      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      e.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const connectAccounts = async () => {
    if (connecting) return;

    setConnecting(true);
    try {
      await postJson<{ ok: boolean; connection?: any }>("/api/money/connections", {
        provider: "manual",
        display_name: "Manual connection",
      });

      showToast({ message: "Connected." }, 1500);
      await refresh(false);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t connect." }, 2500);
    } finally {
      setConnecting(false);
    }
  };

  const cardClass = "border-zinc-200 bg-white";

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const freshnessText = newestAccountUpdatedAt
    ? `Last updated ${softWhen(newestAccountUpdatedAt)}`
    : lastRefreshedAt
    ? `Checked ${softWhen(lastRefreshedAt)}`
    : "";

  const householdContext = householdId ? `Household • ${householdId.slice(0, 6)}…` : "No household";

  return (
    <Page title="Money" subtitle="A calm view of your accounts and activity.">
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>

            <Chip title="Workspace context">{householdContext}</Chip>

            {freshnessText ? (
              <div className="text-xs text-zinc-500">{freshnessText}</div>
            ) : (
              <div className="text-xs text-zinc-500">{statusLine}</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip title="Refresh" onClick={() => void refresh(false)}>
              Refresh
            </Chip>

            <Chip title="Connect accounts (provider layer next)" onClick={() => void connectAccounts()}>
              {connecting ? "Connecting…" : "Connect accounts"}
            </Chip>

            <Link href="/connections">
              <Chip>Connections</Chip>
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {/* Primary input */}
          <Card className={cardClass}>
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Ask about money</div>
              <div className="text-xs text-zinc-500">Search-first. No pressure, no bookkeeping.</div>

              <AssistedSearch scope="money" placeholder="e.g. ‘groceries last week’, ‘Netflix’, ‘recent transfers’, ‘upcoming bills’…" />
            </CardContent>
          </Card>

          {/* Totals */}
          <Card className={cardClass}>
            <CardContent>
              <div className="text-sm font-semibold text-zinc-900">Total balance</div>
              <div className="mt-0.5 text-xs text-zinc-500">Across active accounts</div>

              <div className="mt-3 space-y-1">
                {Array.from(totalBalance.entries()).length === 0 ? (
                  <div className="text-sm text-zinc-600">{loading ? "Loading…" : "No accounts yet."}</div>
                ) : (
                  Array.from(totalBalance.entries()).map(([cur, cents]) => (
                    <div key={cur} className="text-lg font-semibold text-zinc-900">
                      {moneyFromCents(cents, cur)}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Accounts preview */}
          <Card className={cardClass}>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">Accounts</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {loading ? "Loading…" : accounts.length ? "Most recent accounts" : "No accounts yet."}
                  </div>
                </div>
                <Link href="/accounts">
                  <Chip>See all</Chip>
                </Link>
              </div>

              <div className="mt-3 divide-y divide-zinc-100">
                {(accounts ?? [])
                  .filter((a) => !a.archived)
                  .slice(0, 5)
                  .map((a) => {
                    const cur = safeStr(a.currency) || "AUD";
                    const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{safeStr(a.name) || "Untitled account"}</div>
                          <div className="truncate text-xs text-zinc-500">
                            {[safeStr(a.provider) || "Manual", a.updated_at ? `Updated ${softDate(a.updated_at)}` : null]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-zinc-900">{moneyFromCents(cents, cur)}</div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Transactions preview */}
          <Card className={cardClass}>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">Recent activity</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{loading ? "Loading…" : tx.length ? "Latest transactions" : "No transactions yet."}</div>
                </div>
                <Link href="/transactions">
                  <Chip>See all</Chip>
                </Link>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search recent transactions…"
                  className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                <span className="select-none text-xs text-zinc-400">⌘K</span>
              </div>

              <div className="mt-3 divide-y divide-zinc-100">
                {(filteredTx ?? []).slice(0, 8).map((t) => {
                  const cur = safeStr(t.currency) || "AUD";

                  const amountText =
                    typeof t.amount_cents === "number"
                      ? moneyFromCents(t.amount_cents, cur)
                      : typeof t.amount === "number"
                      ? moneyFromAmount(t.amount, cur)
                      : `${cur} 0.00`;

                  const title = safeStr(t.merchant) || safeStr(t.description) || "Transaction";
                  const meta = [t.date ? softDate(t.date) : null, safeStr(t.category) || null, t.pending ? "Pending" : null]
                    .filter(Boolean)
                    .join(" • ");

                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{title}</div>
                        <div className="truncate text-xs text-zinc-500">{meta}</div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-zinc-900">{amountText}</div>
                    </div>
                  );
                })}

                {!loading && filteredTx.length === 0 ? <div className="py-3 text-sm text-zinc-500">No matches.</div> : null}
              </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardContent>
              <div className="text-xs text-zinc-500 space-y-1">
                <div>This hub stays intentionally quiet: it’s for orientation and answers, not bookkeeping.</div>
                <div>Depth lives behind “See all”, filters, and assisted search.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}