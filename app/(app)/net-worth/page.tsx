// app/(app)/net-worth/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  archived?: boolean | null;
  created_at: string;
  updated_at: string;
};

type Liability = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number; // owed amount, stored positive
  currency: string;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

function fmtMoneyFromCents(cents: number, currency: string) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sign = amount < 0 ? "-" : "";
    return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
  }
}

type Bucket = {
  currency: string;
  assetsCents: number;
  liabilitiesCents: number; // positive owed
  netCents: number;
  accounts: Account[];
  liabilities: Liability[];
};

export default function NetWorthPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);

  async function load() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setAccounts([]);
        setLiabilities([]);
        return;
      }

      const [aRes, lRes] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,user_id,name,current_balance_cents,currency,archived,created_at,updated_at")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("liabilities")
          .select("id,user_id,name,current_balance_cents,currency,notes,archived,created_at,updated_at")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      if (aRes.error) throw aRes.error;
      if (lRes.error) throw lRes.error;

      setAccounts((aRes.data as Account[]) ?? []);
      setLiabilities((lRes.data as Liability[]) ?? []);
    } catch (e: any) {
      toast({
        title: "Couldn’t load Net Worth",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const activeLiabilities = useMemo(() => liabilities.filter((l) => !l.archived), [liabilities]);

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();

    const ensure = (currency: string) => {
      const cur = currency || "AUD";
      const existing = map.get(cur);
      if (existing) return existing;

      const fresh: Bucket = {
        currency: cur,
        assetsCents: 0,
        liabilitiesCents: 0,
        netCents: 0,
        accounts: [],
        liabilities: [],
      };
      map.set(cur, fresh);
      return fresh;
    };

    for (const a of activeAccounts) {
      const b = ensure(a.currency || "AUD");
      const bal = Number(a.current_balance_cents ?? 0);

      // Assets are account balances. If you ever want negative account balances treated as liabilities,
      // do that later; V1 uses the explicit liabilities table.
      b.assetsCents += bal;
      b.accounts.push(a);
    }

    for (const l of activeLiabilities) {
      const b = ensure(l.currency || "AUD");
      const owed = Math.max(0, Number(l.current_balance_cents ?? 0));

      b.liabilitiesCents += owed;
      b.liabilities.push(l);
    }

    for (const b of map.values()) {
      b.netCents = b.assetsCents - b.liabilitiesCents;
    }

    // stable order by currency
    return Array.from(map.values()).sort((x, y) => x.currency.localeCompare(y.currency));
  }, [activeAccounts, activeLiabilities]);

  return (
    <Page title="Net Worth" subtitle="A calm snapshot of where you stand, right now.">
      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : buckets.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-sm text-zinc-600">Add an account (and optional liabilities) to see your net position.</div>
            </CardContent>
          </Card>
        ) : (
          buckets.map((b) => (
            <div key={b.currency} className="space-y-3">
              {/* Totals */}
              <Card>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-zinc-800">{b.currency}</div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-zinc-500">Assets</div>
                      <div className="text-base font-medium text-zinc-900">{fmtMoneyFromCents(b.assetsCents, b.currency)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500">Liabilities</div>
                      <div className="text-base font-medium text-zinc-900">{fmtMoneyFromCents(b.liabilitiesCents, b.currency)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500">Net</div>
                      <div className="text-base font-medium text-zinc-900">{fmtMoneyFromCents(b.netCents, b.currency)}</div>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Assets are from Accounts. Liabilities are from your Liabilities list.
                  </div>
                </CardContent>
              </Card>

              {/* Accounts */}
              <Card>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-zinc-800">Accounts</div>
                  {b.accounts.length === 0 ? (
                    <div className="text-sm text-zinc-600">No accounts in {b.currency}.</div>
                  ) : (
                    <div className="space-y-1">
                      {b.accounts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-zinc-800">{a.name}</div>
                          </div>
                          <div className="shrink-0 text-sm text-zinc-800">{fmtMoneyFromCents(a.current_balance_cents ?? 0, b.currency)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Liabilities */}
              <Card>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-zinc-800">Liabilities</div>
                  {b.liabilities.length === 0 ? (
                    <div className="text-sm text-zinc-600">No liabilities in {b.currency}.</div>
                  ) : (
                    <div className="space-y-1">
                      {b.liabilities.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-zinc-800">{l.name}</div>
                            {l.notes ? <div className="truncate text-xs text-zinc-500">{l.notes}</div> : null}
                          </div>
                          <div className="shrink-0 text-sm text-zinc-800">{fmtMoneyFromCents(l.current_balance_cents ?? 0, b.currency)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))
        )}
      </div>
    </Page>
  );
}
