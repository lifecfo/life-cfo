// app/(app)/net-worth/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Money, useToast } from "@/components/ui";
import { useCountUp } from "@/lib/ui/useCountUp";

export const dynamic = "force-dynamic";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  type?: string | null;
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

type InvestmentAccountRow = {
  id: string;
  user_id: string;
  name: string;
  approx_value: number | null; // stored in whole dollars, not cents
  currency: string | null;
};

type Bucket = {
  currency: string;
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
  accounts: Account[];
  liabilities: Liability[];
  investments: InvestmentAccountRow[];
};

// useCountUp can't be called inside a .map() callback (hooks rule) --
// this wraps it so each animated figure is its own component instance,
// same pattern as Money Map/Year. Scoped to the three bucket summary
// figures (Assets, Liabilities, Net) -- not the per-item list rows.
function AnimatedMoney({ cents, currency }: { cents: number; currency: string }) {
  const animated = useCountUp(cents);
  return <Money cents={Math.round(animated)} currency={currency} />;
}

export default function NetWorthPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [investments, setInvestments] = useState<InvestmentAccountRow[]>([]);

  async function load() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setAccounts([]);
        setLiabilities([]);
        setInvestments([]);
        return;
      }

      const [aRes, lRes, iRes] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,user_id,name,current_balance_cents,currency,type,archived,created_at,updated_at")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("liabilities")
          .select("id,user_id,name,current_balance_cents,currency,notes,archived,created_at,updated_at")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("investment_accounts")
          .select("id,user_id,name,approx_value,currency")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      if (aRes.error) throw aRes.error;
      if (lRes.error) throw lRes.error;
      if (iRes.error) throw iRes.error;

      setAccounts((aRes.data as Account[]) ?? []);
      setLiabilities((lRes.data as Liability[]) ?? []);
      setInvestments((iRes.data as InvestmentAccountRow[]) ?? []);
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
        investments: [],
      };
      map.set(cur, fresh);
      return fresh;
    };

    for (const a of activeAccounts) {
      const cur = a.currency || "AUD";
      const bal = Number(a.current_balance_cents ?? 0);
      const type = (a.type || "").trim().toLowerCase();

      if (type === "other") {
        // Genuinely ambiguous -- could be an asset or a debt, and
        // nothing in the data says which. Excluded from both sides
        // rather than guessed at.
        continue;
      }

      const b = ensure(cur);
      if (type === "credit" || type === "loan") {
        // current_balance_cents' sign for these types isn't consistent
        // across providers (confirmed against real account data -- some
        // rows store it negative, some positive). abs() gives the
        // correct owed amount either way.
        b.liabilitiesCents += Math.abs(bal);
      } else {
        // cash, investment (account-level), or any unrecognized/legacy
        // value (e.g. the raw "bank" type some demo-seeded rows carry)
        // -- treated as an asset, matching this page's prior behaviour.
        b.assetsCents += bal;
      }
      b.accounts.push(a);
    }

    for (const l of activeLiabilities) {
      const b = ensure(l.currency || "AUD");
      const owed = Math.max(0, Number(l.current_balance_cents ?? 0));
      b.liabilitiesCents += owed;
      b.liabilities.push(l);
    }

    for (const inv of investments) {
      if (typeof inv.approx_value !== "number") continue;
      const b = ensure(inv.currency || "AUD");
      // approx_value is whole dollars (numeric column); current_balance_cents
      // is cents -- convert so both feed the same cents-based total.
      b.assetsCents += Math.round(inv.approx_value * 100);
      b.investments.push(inv);
    }

    for (const b of map.values()) {
      b.netCents = b.assetsCents - b.liabilitiesCents;
    }

    return Array.from(map.values()).sort((x, y) => x.currency.localeCompare(y.currency));
  }, [activeAccounts, activeLiabilities, investments]);

  return (
    <Page title="Net Worth" subtitle="A calm snapshot of where you stand, right now.">
      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : buckets.length === 0 ? (
          <Card>
            <CardContent className="space-y-2">
              <div className="text-sm text-zinc-600">
                Add an account (and optional liabilities) to see your net position.
              </div>

              <div className="text-sm">
                <Link href="/liabilities" className="text-zinc-900 underline underline-offset-4">
                  Add a liability
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          buckets.map((b) => (
            <div key={b.currency} className="space-y-3">
              <Card>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-zinc-800">{b.currency}</div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-zinc-500">Assets</div>
                      <div className="text-base font-medium text-zinc-900">
                        <AnimatedMoney cents={b.assetsCents} currency={b.currency} />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500">Liabilities</div>
                      <div className="text-base font-medium text-zinc-900">
                        <AnimatedMoney cents={b.liabilitiesCents} currency={b.currency} />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500">Net</div>
                      <div className="text-base font-medium text-zinc-900">
                        <AnimatedMoney cents={b.netCents} currency={b.currency} />
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Assets are cash and investment accounts, plus your Investments list.
                    Liabilities are credit and loan accounts, plus your Liabilities list.
                    Accounts marked "other" aren't included on either side.
                  </div>
                </CardContent>
              </Card>

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
                          <div className="shrink-0 text-sm text-zinc-800">
                            <Money cents={a.current_balance_cents ?? 0} currency={b.currency} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

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
                            {l.notes ? (
                              <div className="truncate text-xs text-zinc-500">{l.notes}</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-sm text-zinc-800">
                            <Money cents={l.current_balance_cents ?? 0} currency={b.currency} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-zinc-800">Investments</div>
                  {b.investments.length === 0 ? (
                    <div className="text-sm text-zinc-600">No investments in {b.currency}.</div>
                  ) : (
                    <div className="space-y-1">
                      {b.investments.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-zinc-800">{inv.name}</div>
                          </div>
                          <div className="shrink-0 text-sm text-zinc-800">
                            <Money cents={Math.round((inv.approx_value ?? 0) * 100)} currency={b.currency} />
                          </div>
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
