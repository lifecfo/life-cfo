"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type CategoryRow = {
  id: string;
  name: string;
  group: string | null;
};

type CategorySpendRow = {
  category: string;
  cents: number;
};

type CategoriesResponse = {
  ok: boolean;
  household_id: string | null;
  categories: CategoryRow[];
  spending: CategorySpendRow[];
  uncategorised_count: number;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency = "AUD") {
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function CategoriesClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CategoriesResponse | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const result = await fetchJson<CategoriesResponse>("/api/money/categories");
      setData(result);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load categories." }, 2500);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();

    for (const c of data?.categories ?? []) {
      const key = safeStr(c.group) || "Other";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="Categories"
      subtitle="How spending is grouped across the household."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Categories</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : data?.categories.length ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Uncategorised transactions</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : data?.uncategorised_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Top category this month</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {loading
                    ? "Loading…"
                    : data?.spending?.[0]
                      ? `${data.spending[0].category} • ${moneyFromCents(data.spending[0].cents)}`
                      : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Groups</div>

            <div className="mt-4 space-y-4">
              {!loading && grouped.length === 0 ? (
                <div className="text-sm text-zinc-500">No categories yet.</div>
              ) : null}

              {grouped.map(([groupName, rows]) => (
                <div key={groupName} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {groupName}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {rows.map((row) => (
                      <Chip key={row.id}>{row.name}</Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Top spending categories</div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && (data?.spending.length ?? 0) === 0 ? (
                <div className="py-3 text-sm text-zinc-500">No category spend yet.</div>
              ) : null}

              {(data?.spending ?? []).map((row) => (
                <div key={row.category} className="flex items-center justify-between gap-3 py-3">
                  <div className="truncate text-sm font-medium text-zinc-900">
                    {row.category}
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-zinc-900">
                    {moneyFromCents(row.cents)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                Categories turn raw transactions into something Life CFO can reason about.
              </div>
              <div>
                The next step after this is Rules, so merchants and descriptions can be classified automatically.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}