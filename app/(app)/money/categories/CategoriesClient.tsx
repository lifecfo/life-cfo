"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip, useToast } from "@/components/ui";
import { SampleStrip, useSampleMode } from "@/lib/demo/sampleMode";
import { useMascotEnabled, usePrefersReducedMotion } from "@/lib/mascot/prefs";
import { MascotCorner } from "@/components/mascot/MascotCorner";

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function CategoriesClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const { on: sampleOn } = useSampleMode();
  const { enabled: mascotEnabled } = useMascotEnabled();
  const reducedMotion = usePrefersReducedMotion();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CategoriesResponse | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [addingCommon, setAddingCommon] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name || savingCategory) return;

    setSavingCategory(true);
    try {
      await fetchJson("/api/money/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewCategoryName("");
      showToast({ message: "Category added." }, 2000);
      await load(true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t add category." }, 2500);
    } finally {
      setSavingCategory(false);
    }
  }

  async function addCommonCategories() {
    if (addingCommon) return;

    setAddingCommon(true);
    try {
      const result = await fetchJson<{ ok: boolean; added: CategoryRow[]; skipped: string[] }>(
        "/api/money/categories",
        { method: "POST", body: JSON.stringify({ common: true }) }
      );
      showToast(
        {
          message:
            result.added.length > 0
              ? `Added ${result.added.length} categor${result.added.length === 1 ? "y" : "ies"}.`
              : "Those categories already exist.",
        },
        2500
      );
      await load(true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t add common categories." }, 2500);
    } finally {
      setAddingCommon(false);
    }
  }

  function startRename(row: CategoryRow) {
    setEditingId(row.id);
    setEditingName(row.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveRename() {
    const name = editingName.trim();
    if (!editingId || !name || savingEdit) return;

    setSavingEdit(true);
    try {
      await fetchJson("/api/money/categories", {
        method: "PATCH",
        body: JSON.stringify({ id: editingId, name }),
      });
      cancelRename();
      await load(true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t rename category." }, 2500);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteCategory(id: string) {
    if (deletingId) return;

    setDeletingId(id);
    try {
      await fetchJson(`/api/money/categories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load(true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t delete category." }, 2500);
    } finally {
      setDeletingId(null);
    }
  }

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
      <Chip onClick={() => router.push("/spending")}>Back to Spending</Chip>
    </div>
  );

  return (
    <Page
      title="Categories"
      subtitle="Categories group your transactions so Life CFO can summarise your spending."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <SampleStrip />
        {sampleOn ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="text-sm text-zinc-600">
              Sample household is on. Turn it off to see and manage your own categories.
            </CardContent>
          </Card>
        ) : (
          <>
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
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Add category</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                Create a category, or add a common starter set in one go.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Groceries"
                className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
              <Button
                onClick={() => void addCategory()}
                disabled={savingCategory || !newCategoryName.trim()}
                className="rounded-2xl"
              >
                {savingCategory ? "Adding…" : "Add category"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void addCommonCategories()}
                disabled={addingCommon}
                className="rounded-2xl"
              >
                {addingCommon ? "Adding…" : "Add common categories"}
              </Button>
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

                  <div className="mt-3 divide-y divide-zinc-100">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 py-2">
                        {editingId === row.id ? (
                          <>
                            <input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                              autoFocus
                            />
                            <div className="flex shrink-0 items-center gap-1">
                              <Chip onClick={() => void saveRename()}>
                                {savingEdit ? "Saving…" : "Save"}
                              </Chip>
                              <Chip onClick={cancelRename}>Cancel</Chip>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="truncate text-sm text-zinc-800">{row.name}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <Chip onClick={() => startRename(row)}>Rename</Chip>
                              <Chip onClick={() => void deleteCategory(row.id)}>
                                {deletingId === row.id ? "Deleting…" : "Delete"}
                              </Chip>
                            </div>
                          </>
                        )}
                      </div>
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
                The next step after this is Rules, so merchants and descriptions can be classified automatically.
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
      {!loading && grouped.length === 0 ? (
        <MascotCorner mode="static" contentMaxWidth={860} enabled={mascotEnabled} reducedMotion={reducedMotion} />
      ) : null}
    </Page>
  );
}