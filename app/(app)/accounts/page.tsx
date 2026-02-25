"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

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

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
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

export default function AccountsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return accounts;

    return accounts.filter((a) => {
      const hay = [
        safeStr(a.name),
        safeStr(a.provider),
        safeStr(a.type),
        safeStr(a.status),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [accounts, q]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>(
          "/api/money/accounts"
        );

        if (!alive) return;
        setAccounts(data.accounts ?? []);
      } catch (e: any) {
        if (!alive) return;
        showToast({ message: e?.message ?? "Couldn’t load accounts." }, 2500);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showToast]);

  return (
    <Page title="Accounts" subtitle="Your active accounts.">
      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/money">
          <Chip>Back to Money</Chip>
        </Link>

        <Link href="/connections">
          <Chip>Manage connections</Chip>
        </Link>
      </div>

      <div className="mt-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">
                  Accounts
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {loading
                    ? "Loading…"
                    : accounts.length
                    ? "All active accounts"
                    : "No accounts yet."}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search accounts…"
                className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </div>

            <div className="mt-3 divide-y divide-zinc-100">
              {filtered
                .filter((a) => !a.archived)
                .map((a) => {
                  const cur = safeStr(a.currency) || "AUD";
                  const cents =
                    typeof a.current_balance_cents === "number"
                      ? a.current_balance_cents
                      : 0;

                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {safeStr(a.name) || "Untitled account"}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          {[
                            safeStr(a.provider) || "Manual",
                            safeStr(a.type) || null,
                            a.updated_at
                              ? `Updated ${softDate(a.updated_at)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      </div>

                      <div className="shrink-0 text-sm font-semibold text-zinc-900">
                        {moneyFromCents(cents, cur)}
                      </div>
                    </div>
                  );
                })}

              {!loading && filtered.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">
                  No matches.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}