"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast, Button } from "@/components/ui";

type RuleRow = {
  id: string;
  merchant_pattern: string | null;
  description_pattern: string | null;
  category: string;
  priority: number | null;
  created_at: string | null;
};

type RulesResponse = {
  ok: boolean;
  household_id: string | null;
  rules: RuleRow[];
  categories_available: string[];
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function softDate(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString();
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

export default function RulesClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<RulesResponse | null>(null);

  const [merchantPattern, setMerchantPattern] = useState("");
  const [descriptionPattern, setDescriptionPattern] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("100");

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const result = await fetchJson<RulesResponse>("/api/money/rules");
      setData(result);

      if (!category && result.categories_available.length > 0) {
        setCategory(result.categories_available[0]);
      }
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load rules." }, 2500);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function createRule() {
    if (saving) return;

    setSaving(true);
    try {
      await fetchJson("/api/money/rules", {
        method: "POST",
        body: JSON.stringify({
          merchant_pattern: merchantPattern,
          description_pattern: descriptionPattern,
          category,
          priority: Number(priority || 100),
        }),
      });

      setMerchantPattern("");
      setDescriptionPattern("");
      setPriority("100");

      showToast({ message: "Rule added." }, 2000);
      await load(true);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t add rule." }, 2500);
    } finally {
      setSaving(false);
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

  const rules = data?.rules ?? [];
  const categories = data?.categories_available ?? [];

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="Rules"
      subtitle="Automatic categorisation rules for household transactions."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Rules</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : rules.length}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Available categories</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : categories.length}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {loading ? "Loading…" : rules.length ? "Rules ready" : "No rules yet"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Add rule</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                Match a merchant or description, then assign a category.
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Merchant pattern</div>
                <input
                  value={merchantPattern}
                  onChange={(e) => setMerchantPattern(e.target.value)}
                  placeholder="e.g. WOOLWORTHS"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Description pattern</div>
                <input
                  value={descriptionPattern}
                  onChange={(e) => setDescriptionPattern(e.target.value)}
                  placeholder="e.g. UBER"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Category</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                >
                  {categories.length === 0 ? (
                    <option value="">No categories yet</option>
                  ) : null}

                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Priority</div>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  placeholder="100"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => void createRule()}
                disabled={saving || !category || (!merchantPattern.trim() && !descriptionPattern.trim())}
                className="rounded-2xl"
              >
                {saving ? "Adding…" : "Add rule"}
              </Button>

              <Chip
                onClick={() => {
                  setMerchantPattern("");
                  setDescriptionPattern("");
                  setPriority("100");
                }}
              >
                Clear
              </Chip>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Current rules</div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && rules.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">No rules created yet.</div>
              ) : null}

              {rules.map((rule) => {
                const matchParts = [
                  safeStr(rule.merchant_pattern)
                    ? `Merchant: ${safeStr(rule.merchant_pattern)}`
                    : null,
                  safeStr(rule.description_pattern)
                    ? `Description: ${safeStr(rule.description_pattern)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" • ");

                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">
                        {safeStr(rule.category) || "Category"}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {matchParts || "No match pattern"}
                      </div>
                    </div>

                    <div className="shrink-0 text-xs text-zinc-500">
                      {rule.created_at ? `Added ${softDate(rule.created_at)}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Categories available to rules</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!loading && categories.length === 0 ? (
                <div className="text-sm text-zinc-500">No categories yet.</div>
              ) : null}

              {categories.map((name) => (
                <Chip key={name}>{name}</Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                Rules let Life CFO classify transactions consistently without redoing work every time.
              </div>
              <div>
                The next step after this is auto-apply, so new and existing transactions can inherit categories.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}