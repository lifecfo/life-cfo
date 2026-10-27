// app/(app)/feedback/review/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

type FeedbackRow = {
  id: string;
  path: string;
  message: string;
  created_at: string;
  email: string;
};

type TypeFilter = "all" | "yes" | "not_quite" | "detailed";

function softDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

// The inline page prompt only ever sends exactly "Yes" or "Not quite" /
// "Not quite: <detail>". Anything else -- typed detail, or the dedicated
// /feedback form's free text -- counts as "detailed".
function classify(message: string): Exclude<TypeFilter, "all"> {
  const trimmed = message.trim();
  if (trimmed.toLowerCase() === "yes") return "yes";
  if (trimmed === "Not quite") return "not_quite";
  return "detailed";
}

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "All",
  yes: "Yes",
  not_quite: "Not quite",
  detailed: "Detailed",
};

export default function FeedbackReviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [pageFilter, setPageFilter] = useState("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback/review", { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; feedback?: FeedbackRow[]; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error || "Couldn't load feedback.");
        return;
      }
      setRows(json.feedback ?? []);
    } catch {
      setError("Couldn't load feedback.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const pages = useMemo(() => {
    const unique = new Set(rows.map((row) => row.path || "unknown"));
    return Array.from(unique).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && classify(row.message) !== typeFilter) return false;
      if (pageFilter !== "all" && (row.path || "unknown") !== pageFilter) return false;
      if (needle) {
        const haystack = `${row.email} ${row.message}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, pageFilter]);

  const hasFilters = search.trim() !== "" || typeFilter !== "all" || pageFilter !== "all";

  return (
    <Page title="Feedback review" subtitle="Developer-only. Every household's feedback, newest first.">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip onClick={() => void load()}>Refresh</Chip>
            {hasFilters ? (
              <Chip
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                  setPageFilter("all");
                }}
              >
                Clear filters
              </Chip>
            ) : null}
            <span className="text-xs text-zinc-500">
              {filtered.length === rows.length
                ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`
                : `${filtered.length} of ${rows.length}`}
            </span>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or message…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          />

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "yes", "not_quite", "detailed"] as TypeFilter[]).map((key) => (
              <Chip key={key} active={typeFilter === key} onClick={() => setTypeFilter(key)}>
                {TYPE_LABELS[key]}
              </Chip>
            ))}

            <select
              value={pageFilter}
              onChange={(event) => setPageFilter(event.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">All pages</option>
              {pages.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

        {!loading && rows.length === 0 && !error ? (
          <div className="text-sm text-zinc-600">No feedback submitted yet.</div>
        ) : null}

        {!loading && rows.length > 0 && filtered.length === 0 ? (
          <div className="text-sm text-zinc-600">No feedback matches these filters.</div>
        ) : null}

        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.id} className="border-zinc-200 bg-white">
              <CardContent className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>{row.email}</span>
                  <span>
                    {row.path} · {softDate(row.created_at)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-zinc-800">{row.message}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
