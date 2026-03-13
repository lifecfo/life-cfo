"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import {
  ACTIVE_HOUSEHOLD_CHANGED_EVENT,
  ACTIVE_HOUSEHOLD_STORAGE_KEY,
  resolveActiveHouseholdIdClient,
} from "@/lib/households/resolveActiveHouseholdClient";

type FinancialSnapshot = {
  asOf: string;
  liquidity: { availableCashCents: number; accountCount: number };
  income: { recurringMonthlyCents: number; sourceCount: number };
  commitments: { recurringMonthlyCents: number; billCount: number };
  discretionary: { last30DayOutflowCents: number };
  connections: { total: number; stale: number; maxAgeDays: number };
};

type SnapshotExplanation = {
  headline: string;
  summary: string;
  insights: string[];
  pressure: {
    structural: string;
    discretionary: string;
    timing: string;
    stability: string;
  };
};

type OverviewResponse = {
  snapshot: FinancialSnapshot;
  explanation: SnapshotExplanation;
};

type GoalStatus = "active" | "paused" | "done" | "archived";

type MoneyGoal = {
  id: string;
  title: string | null;
  currency: string | null;
  target_cents: number | null;
  current_cents: number | null;
  status: GoalStatus | string | null;
  deadline_at: string | null;
  is_primary: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const amt = n / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function softDate(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "";
  const ms = Date.parse(isoOrDate);
  if (!Number.isFinite(ms)) {
    const ms2 = Date.parse(`${isoOrDate}T00:00:00Z`);
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeGoalStatus(s: unknown): GoalStatus {
  const t = String(s ?? "active").trim().toLowerCase();
  if (t === "paused" || t === "done" || t === "archived") return t;
  return "active";
}

function sortGoals(goals: MoneyGoal[]) {
  return [...goals].sort((a, b) => {
    const ap = a.is_primary ? 1 : 0;
    const bp = b.is_primary ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const au = Date.parse(a.updated_at || a.created_at || "") || 0;
    const bu = Date.parse(b.updated_at || b.created_at || "") || 0;
    return bu - au;
  });
}

export default function PlannedClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goals, setGoals] = useState<MoneyGoal[]>([]);
  const householdIdRef = useRef<string | null>(null);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const overview = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(overview);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not load Planned view.");
      setError(message);
      if (!silent) showToast({ message }, 2500);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  const loadGoals = useCallback(async (silent = false) => {
    if (!silent) setGoalsLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (authErr || !userId) {
        setGoals([]);
        return;
      }

      const householdId = await resolveActiveHouseholdIdClient(supabase, userId);
      if (!householdId) {
        if (householdIdRef.current !== null) setGoals([]);
        householdIdRef.current = null;
        setGoals([]);
        return;
      }

      if (householdIdRef.current !== householdId) {
        setGoals([]);
      }
      householdIdRef.current = householdId;

      const res = await supabase.from("money_goals").select("*").eq("household_id", householdId);
      if (res.error) throw res.error;

      const rows = (res.data ?? []) as MoneyGoal[];
      const cleaned = rows.map((g) => ({
        ...g,
        status: normalizeGoalStatus(g.status),
        currency: (g.currency || "AUD").toUpperCase(),
      }));
      setGoals(sortGoals(cleaned));
    } catch {
      setGoals([]);
    } finally {
      if (!silent) setGoalsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    void loadGoals(false);
  }, [load, loadGoals]);

  useEffect(() => {
    const onActiveHouseholdChanged = () => {
      void load(true);
      void loadGoals(true);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACTIVE_HOUSEHOLD_STORAGE_KEY) return;
      void load(true);
      void loadGoals(true);
    };

    window.addEventListener("focus", onActiveHouseholdChanged);
    window.addEventListener(
      ACTIVE_HOUSEHOLD_CHANGED_EVENT,
      onActiveHouseholdChanged as EventListener
    );
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onActiveHouseholdChanged);
      window.removeEventListener(
        ACTIVE_HOUSEHOLD_CHANGED_EVENT,
        onActiveHouseholdChanged as EventListener
      );
      window.removeEventListener("storage", onStorage);
    };
  }, [load, loadGoals]);

  const goalsInFocus = useMemo(() => {
    if (!goals.length) return [] as MoneyGoal[];
    const active = goals.filter((g) => normalizeGoalStatus(g.status) === "active");
    const primary =
      active.find((g) => !!g.is_primary) ??
      goals.find((g) => !!g.is_primary) ??
      null;

    if (primary) {
      return [primary, ...active.filter((g) => g.id !== primary.id)].slice(0, 3);
    }
    return (active.length ? active : goals).slice(0, 3);
  }, [goals]);

  const right = (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        onClick={() => {
          void load(false);
          void loadGoals(false);
        }}
      >
        Refresh
      </Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page title="Planned" subtitle="Upcoming commitments, goals, and near-term timing." right={right}>
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 sm:px-6">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Upcoming commitments</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>
                Recurring commitments: {snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : loading ? "Loading..." : "-"}
              </li>
              <li>
                Bills tracked: {snapshot ? snapshot.commitments.billCount : loading ? "Loading..." : "-"}
              </li>
              <li>{explanation?.pressure.timing || "Timing notes will appear here."}</li>
            </ul>
            <div className="text-xs text-zinc-500">{explanation?.pressure.structural || "Commitment notes will appear here."}</div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Timing notes</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>{explanation?.pressure.timing || (loading ? "Loading..." : "Timing notes will appear here.")}</li>
              <li>{explanation?.pressure.structural || (loading ? "Loading..." : "Commitment notes will appear here.")}</li>
              <li>{explanation?.pressure.discretionary || (loading ? "Loading..." : "Spending rhythm notes will appear here.")}</li>
            </ul>
            <div className="text-xs text-zinc-500">
              Snapshot date: {snapshot?.asOf ? softDate(snapshot.asOf) : loading ? "Loading..." : "No date"}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Goals in focus</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              {goalsLoading ? <li>Loading goals...</li> : null}
              {!goalsLoading && goalsInFocus.length === 0 ? <li>No goals in focus yet.</li> : null}
              {goalsInFocus.map((goal) => {
                const current = toInt(goal.current_cents) ?? 0;
                const target = toInt(goal.target_cents) ?? 0;
                const currency = goal.currency || "AUD";
                const progress = target > 0
                  ? `${formatMoney(current, currency)} of ${formatMoney(target, currency)}`
                  : `${formatMoney(current, currency)} saved`;
                const due = goal.deadline_at ? `, target ${softDate(goal.deadline_at)}` : "";
                const primary = goal.is_primary ? " (primary)" : "";
                return (
                  <li key={goal.id}>
                    {(goal.title || "Goal").trim() || "Goal"}: {progress}{due}{primary}
                  </li>
                );
              })}
              <li>
                Commitments in view: {snapshot ? `${snapshot.commitments.billCount} bill(s)` : loading ? "Loading..." : "-"}
              </li>
              <li>{explanation?.pressure.timing || "Timing notes will appear here."}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href="/money/goals">
                <Chip>Goals</Chip>
              </Link>
              <Link href="/bills">
                <Chip>Bills</Chip>
              </Link>
              <Link href="/money">
                <Chip>Money</Chip>
              </Link>
            </div>
            <div className="text-xs text-zinc-500">
              Keep goals and upcoming due dates in view together.
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Open related pages</div>
            <div className="flex flex-wrap gap-2">
              <Link href="/money">
                <Chip>Money</Chip>
              </Link>
              <Link href="/bills">
                <Chip>Bills</Chip>
              </Link>
              <Link href="/money/goals">
                <Chip>Goals</Chip>
              </Link>
              <Link href="/transactions">
                <Chip>Transactions</Chip>
              </Link>
              <Link href="/connections">
                <Chip>Connections</Chip>
              </Link>
            </div>
            <div className="text-xs text-zinc-500">
              Go deeper into bills, goals, and recent transaction evidence.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
