// app/(app)/accounts/AccountsPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";

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

function providerLabel(provider: string | null | undefined) {
  const p = safeStr(provider).trim().toLowerCase();
  if (!p || p === "manual") return "Manual";
  if (p === "plaid") return "Plaid";
  if (p === "basiq") return "Basiq";
  return p.toUpperCase();
}

function isImportedProvider(provider: string | null | undefined) {
  const p = safeStr(provider).trim().toLowerCase();
  return p !== "" && p !== "manual";
}

function moneyFromCents(cents: number, currency: string) {
  return formatMoneyFromCents(cents, safeStr(currency) || "AUD");
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
  const json = await res.json().catch(() => ({}));
  const errorText =
    typeof (json as { error?: unknown })?.error === "string"
      ? (json as { error?: string }).error
      : "Request failed";
  if (!res.ok) throw new Error(errorText);
  return json as T;
}

export const dynamic = "force-dynamic";

export default function AccountsPage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return accounts;

    return accounts.filter((a) => {
      const hay = [safeStr(a.name), safeStr(a.provider), safeStr(a.type), safeStr(a.status), safeStr(a.currency)]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [accounts, q]);

  const importedCount = useMemo(
    () => accounts.filter((a) => isImportedProvider(a.provider)).length,
    [accounts]
  );
  const manualCount = useMemo(
    () => accounts.filter((a) => !isImportedProvider(a.provider)).length,
    [accounts]
  );
  const latestUpdated = useMemo(() => {
    const newestMs = accounts.reduce((best, a) => {
      const ms = Date.parse(a.updated_at || a.created_at || "");
      if (!Number.isFinite(ms)) return best;
      return Math.max(best, ms);
    }, 0);
    return newestMs > 0 ? new Date(newestMs).toISOString() : null;
  }, [accounts]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchJson<{ ok: boolean; accounts: AccountRow[]; household_id?: string }>("/api/money/accounts");
        if (!alive) return;
        setAccounts(data.accounts ?? []);
      } catch (e: unknown) {
        if (!alive) return;
        const message = e instanceof Error && e.message ? e.message : "Couldn't load accounts.";
        showToast({ message }, 2500);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showToast]);

  const cardClass = "border-zinc-200 bg-white";

  return (
    <Page title="Accounts" subtitle="Your connected and manual accounts.">
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/money">
              <Chip>Back to Money</Chip>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/connections">
              <Chip>Manage connections</Chip>
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {/* Assisted search */}
          <Card className={cardClass}>
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Find anything</div>
              <div className="text-xs text-zinc-500">Search-first. No scrolling.</div>
              <AssistedSearch scope="accounts" placeholder="Search accounts..." />
            </CardContent>
          </Card>

          {/* List */}
          <Card className={cardClass}>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">Accounts</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {loading ? "Loading..." : accounts.length ? "All active accounts" : "No accounts yet."}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                {loading
                  ? "Checking account sources..."
                  : accounts.length
                    ? `${importedCount} connected account(s), ${manualCount} manual account(s). ${
                        latestUpdated ? `Last updated ${softDate(latestUpdated)}.` : ""
                      }`
                    : "Connect a bank or add a manual account to get started."}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter locally..."
                  className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                {q.trim() ? <Chip onClick={() => setQ("")}>Clear</Chip> : null}
              </div>

              <div className="mt-3 divide-y divide-zinc-100">
                {filtered
                  .filter((a) => !a.archived)
                  .map((a) => {
                    const cur = safeStr(a.currency) || "AUD";
                    const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
                    const provider = providerLabel(a.provider);
                    const sourceLine =
                      provider === "Manual" ? "Manual entry" : `Connected via ${provider}`;

                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{safeStr(a.name) || "Untitled account"}</div>
                          <div className="truncate text-xs text-zinc-500">
                            {[
                              sourceLine,
                              safeStr(a.type) || null,
                              safeStr(a.status) || null,
                              a.updated_at ? `Updated ${softDate(a.updated_at)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          </div>
                        </div>

                        <div className="shrink-0 text-sm font-semibold text-zinc-900">{moneyFromCents(cents, cur)}</div>
                      </div>
                    );
                  })}

                {!loading && filtered.filter((a) => !a.archived).length === 0 ? (
                  <div className="py-3 text-sm text-zinc-500">No matches.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}
