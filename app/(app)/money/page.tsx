"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

export default function MoneyClient() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [tx, setTx] = useState<TxRow[]>([]);
  const [q, setQ] = useState("");

  const [connecting, setConnecting] = useState(false);

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

  const refresh = async () => {
    setLoading(true);
    try {
      const a = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>("/api/money/accounts");
      const t = await fetchJson<{ ok: boolean; transactions: TxRow[] }>("/api/money/transactions?limit=25");
      setAccounts(a.accounts ?? []);
      setTx(t.transactions ?? []);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t load money data." }, 2500);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const a = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>("/api/money/accounts");
        const t = await fetchJson<{ ok: boolean; transactions: TxRow[] }>("/api/money/transactions?limit=25");

        if (!alive) return;
        setAccounts(a.accounts ?? []);
        setTx(t.transactions ?? []);
      } catch (e: any) {
        if (!alive) return;
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

  const connectAccounts = async () => {
    if (connecting) return;

    setConnecting(true);
    try {
      await postJson<{ ok: boolean; connection?: any }>("/api/money/connections", {
        provider: "manual",
        display_name: "Manual connection",
      });

      showToast({ message: "Connected." }, 1500);
      await refresh();
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t connect." }, 2500);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Page title="Money" subtitle="A calm view of your accounts and activity.">
      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip title="Connect accounts (provider layer next)" onClick={() => void connectAccounts()}>
          {connecting ? "Connecting…" : "Connect accounts"}
        </Chip>

        <Link href="/connections">
          <Chip>Connections</Chip>
        </Link>

        <Link href="/accounts">
          <Chip>All accounts</Chip>
        </Link>

        <Link href="/transactions">
          <Chip>All transactions</Chip>
        </Link>
      </div>

      {/* Totals */}
      <div className="mt-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Total balance</div>
            <div className="mt-1 text-xs text-zinc-500">Across active accounts</div>

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
      </div>

      {/* Accounts preview */}
      <div className="mt-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Accounts</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {loading ? "Loading…" : accounts.length ? "Most recent accounts" : "No accounts yet."}
                </div>
              </div>
              <Link href="/accounts">
                <Chip>View</Chip>
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
      </div>

      {/* Transactions preview */}
      <div className="mt-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Recent activity</div>
                <div className="mt-0.5 text-xs text-zinc-500">{loading ? "Loading…" : tx.length ? "Latest transactions" : "No transactions yet."}</div>
              </div>
              <Link href="/transactions">
                <Chip>View</Chip>
              </Link>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search transactions…"
                className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <span className="text-xs text-zinc-400">⌘K</span>
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
      </div>
    </Page>
  );
}