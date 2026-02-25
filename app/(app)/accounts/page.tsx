// app/(app)/accounts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Badge, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ---------------- types (MATCH /api/money/accounts) ---------------- */

type AccountRow = {
  id: string;
  user_id: string;
  name: string | null;
  provider: string | null;
  type: string | null;
  status: string | null;
  archived: boolean | null;
  current_balance_cents: number | null;
  currency: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Tab = "overview" | "manual";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeBool(v: unknown) {
  return typeof v === "boolean" ? v : false;
}

function moneyFromCents(cents: number, currency = "AUD") {
  const amt = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function prettyWhen(iso?: string | null) {
  const s = safeStr(iso);
  const ms = Date.parse(s);
  if (!s || Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function acctTypeLabel(t: string | null) {
  const s = (t || "").toLowerCase();
  if (!s) return "Account";
  if (/(trans|everyday|checking|transaction)/i.test(s)) return "Everyday";
  if (/(save|savings)/i.test(s)) return "Savings";
  if (/(credit|cc)/i.test(s)) return "Credit";
  if (/(loan|mortgage)/i.test(s)) return "Loan";
  if (/(invest|broker)/i.test(s)) return "Investment";
  return t || "Account";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

function parseMoneyToCentsNumber(input: string): number | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function AccountsPage() {
  const router = useRouter();
  const toastApi: any = useToast();
  const toast =
    toastApi?.toast ??
    ((args: any) => {
      toastApi?.showToast?.({ message: [args?.title, args?.description].filter(Boolean).join(" — ") || "Done." });
    });

  const [tab, setTab] = useState<Tab>("overview");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Manual add (writes via connections stub right now)
  // NOTE: we intentionally do NOT write directly to accounts from the client.
  // For V1, you seed starter accounts via POST /api/money/connections (manual).
  const [mProvider, setMProvider] = useState("manual");
  const [mDisplayName, setMDisplayName] = useState("Manual connection");
  const [connecting, setConnecting] = useState(false);

  async function loadAccounts(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const json = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>("/api/money/accounts");
      setRows((json.accounts ?? []) as AccountRow[]);
    } catch (e: any) {
      setRows([]);
      setError(e?.message ?? "Couldn’t load accounts.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = useMemo(() => rows.filter((r) => !safeBool(r.archived)), [rows]);

  const totals = useMemo(() => {
    const cur0 = (safeStr(activeAccounts[0]?.currency) || "AUD").toUpperCase();
    const allSame = activeAccounts.every((a) => (safeStr(a.currency) || "AUD").toUpperCase() === cur0);
    if (!allSame) return { ok: false as const, currency: null as string | null, cents: null as number | null };

    let cents = 0;
    let any = false;
    for (const a of activeAccounts) {
      if (typeof a.current_balance_cents === "number") {
        cents += a.current_balance_cents;
        any = true;
      }
    }
    return { ok: true as const, currency: cur0, cents: any ? cents : null };
  }, [activeAccounts]);

  async function connectManualAndSeed() {
    if (connecting) return;
    setConnecting(true);

    try {
      await postJson("/api/money/connections", {
        provider: (mProvider || "manual").trim(),
        display_name: (mDisplayName || "Manual connection").trim(),
        currency: "AUD",
      });

      toast({ title: "Connected", description: "Starter accounts added (if needed)." });
      setTab("overview");
      await loadAccounts(true);
    } catch (e: any) {
      toast({ title: "Couldn’t connect", description: e?.message ?? "Try again." });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Page title="Accounts" subtitle="Simple inputs. Later, providers can snap in without a rewrite.">
      <div className="mx-auto max-w-[760px] space-y-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-zinc-900">Your accounts</div>
                <div className="text-xs text-zinc-500">Read-only view. Add connections to seed and sync later.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip className="text-xs" onClick={() => router.push("/money")}>
                  Back to Money
                </Chip>
                <Chip className="text-xs" onClick={() => void loadAccounts(false)} disabled={loading}>
                  Refresh
                </Chip>
                <Button onClick={() => setTab("manual")} className="rounded-2xl">
                  Connect / Seed
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip className="text-xs" onClick={() => setTab("overview")}>
                Overview
              </Chip>
              <Chip className="text-xs" onClick={() => setTab("manual")}>
                Connect / Seed
              </Chip>
            </div>

            {tab === "overview" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Quick view</div>
                  <div className="mt-1 text-sm text-zinc-800">
                    {activeAccounts.length === 0
                      ? loading
                        ? "Loading…"
                        : "No accounts yet."
                      : totals.ok
                      ? `Accounts: ${activeAccounts.length}${totals.cents !== null ? ` • Total: ${moneyFromCents(totals.cents, totals.currency || "AUD")}` : ""}`
                      : `Accounts: ${activeAccounts.length} • Total: — (multiple currencies)`}
                  </div>

                  {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip className="text-xs" onClick={() => setTab("manual")}>
                      Connect accounts
                    </Chip>
                  </div>
                </div>

                {activeAccounts.length === 0 ? (
                  <div className="text-sm text-zinc-700">Nothing here yet.</div>
                ) : (
                  <div className="space-y-2">
                    {activeAccounts.slice(0, 20).map((a) => {
                      const cur = (safeStr(a.currency) || "AUD").toUpperCase();
                      const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;

                      return (
                        <div key={a.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-medium text-zinc-900">{safeStr(a.name) || "Untitled account"}</div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {[safeStr(a.provider) || "Manual", a.updated_at ? `Updated ${prettyWhen(a.updated_at)}` : null].filter(Boolean).join(" • ")}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge>{acctTypeLabel(a.type)}</Badge>
                                {a.status ? <Chip className="text-xs">{a.status}</Chip> : null}
                              </div>
                            </div>

                            <div className="shrink-0 text-sm font-semibold text-zinc-900">{moneyFromCents(cents, cur)}</div>
                          </div>
                        </div>
                      );
                    })}

                    {activeAccounts.length > 20 ? <div className="text-xs text-zinc-500">Showing 20. Search/paging can come next.</div> : null}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "manual" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Connect (stub)</div>
                  <div className="mt-1 text-xs text-zinc-500">This creates a connection record and seeds starter accounts only if you have none.</div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 space-y-3">
                  <label className="space-y-1 block">
                    <div className="text-xs text-zinc-600">Provider</div>
                    <input
                      value={mProvider}
                      onChange={(e) => setMProvider(e.target.value)}
                      placeholder="manual"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-xs text-zinc-600">Display name</div>
                    <input
                      value={mDisplayName}
                      onChange={(e) => setMDisplayName(e.target.value)}
                      placeholder="Manual connection"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void connectManualAndSeed()} disabled={connecting} className="rounded-2xl">
                      {connecting ? "Connecting…" : "Connect"}
                    </Button>
                    <Chip className="text-xs" onClick={() => setTab("overview")} disabled={connecting}>
                      Done
                    </Chip>
                  </div>

                  <div className="text-xs text-zinc-500">Later: this will start Plaid/Basiq linking instead of a stub.</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}