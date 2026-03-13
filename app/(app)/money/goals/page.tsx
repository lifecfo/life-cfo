// app/(app)/money/goals/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ACTIVE_HOUSEHOLD_CHANGED_EVENT,
  ACTIVE_HOUSEHOLD_STORAGE_KEY,
  resolveActiveHouseholdIdClient,
} from "@/lib/households/resolveActiveHouseholdClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type GoalStatus = "active" | "paused" | "done" | "archived";

type MoneyGoal = {
  id: string;
  user_id?: string | null;
  household_id?: string | null;

  title: string | null;
  currency: string | null;

  // target + progress (recommended)
  target_cents?: number | null;
  current_cents?: number | null;

  // optional “envelope” fields (if you add them later)
  status?: GoalStatus | string | null;
  deadline_at?: string | null;
  notes?: string | null;

  // optional “V1+”
  is_primary?: boolean | null;
  sort_order?: number | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type GoalUpdate = {
  id: string;
  goal_id: string;
  user_id?: string | null;
  household_id?: string | null;

  delta_cents: number;
  note: string | null;
  created_at: string | null;
};

function safeUUID() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toInt(n: unknown) {
  const x = typeof n === "number" ? n : n == null ? NaN : Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function moneyFromCents(cents: number | null | undefined, currency: string | null | undefined) {
  const n = typeof cents === "number" ? cents : cents == null ? null : Number(cents);
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const cur = (currency || "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n / 100);
  } catch {
    return `${cur} ${(n / 100).toFixed(2)}`;
  }
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function normalizeStatus(s: unknown): GoalStatus {
  const t = String(s ?? "active").trim().toLowerCase();
  if (t === "paused" || t === "done" || t === "archived") return t;
  return "active";
}

function percent(currentCents: number, targetCents: number) {
  if (targetCents <= 0) return 0;
  return clamp(Math.round((currentCents / targetCents) * 100), 0, 999);
}

function parseMoneyToCents(input: string) {
  // Accept "1200", "1,200", "1200.50", "$1,200.50", "-50"
  const s = String(input || "")
    .trim()
    .replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function hasPrimarySupport(goals: MoneyGoal[]) {
  // If column doesn't exist, supabase returns objects without it.
  return goals.some((g) => "is_primary" in g);
}

function sortGoals(goals: MoneyGoal[]) {
  // If is_primary / sort_order exist, prefer them. Otherwise fall back to updated_at desc.
  return [...goals].sort((a, b) => {
    const ap = a.is_primary ? 1 : 0;
    const bp = b.is_primary ? 1 : 0;
    if (ap !== bp) return bp - ap;

    const ao = typeof a.sort_order === "number" ? a.sort_order : 100;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 100;
    if (ao !== bo) return ao - bo;

    const au = Date.parse(a.updated_at || a.created_at || "") || 0;
    const bu = Date.parse(b.updated_at || b.created_at || "") || 0;
    return bu - au;
  });
}

function isSameDay(aIso: string, bIso: string) {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function relativeDayLabel(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return fmtDateShort(iso);

  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const yday = new Date(today);
  yday.setDate(today.getDate() - 1);

  if (isSameDay(d.toISOString(), today.toISOString())) return "Today";
  if (isSameDay(d.toISOString(), yday.toISOString())) return "Yesterday";
  return fmtDateShort(iso);
}

export default function GoalsPage() {
  const router = useRouter();

  const toastApi: any = useToast();

  const notify = (opts: { title?: string; description?: string; variant?: any }) => {
    const title = String(opts.title ?? "Done");
    const description = String(opts.description ?? "");
    const variant = opts.variant;

    // Prefer the underlying toast() API (most reliable)
    if (typeof toastApi?.toast === "function") {
      toastApi.toast({ title, description, variant });
      return;
    }

    // If your implementation uses showToast(), pass the exact shape it expects
    if (typeof toastApi?.showToast === "function") {
      toastApi.showToast({ title, description, variant });
      return;
    }

    // Last resort: avoid silent failures
    console.warn("Toast API not available", { title, description, variant });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");

  const [loadingGoals, setLoadingGoals] = useState(false);
  const [goals, setGoals] = useState<MoneyGoal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [updates, setUpdates] = useState<GoalUpdate[]>([]);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create/Edit form
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [target, setTarget] = useState(""); // dollars input
  const [current, setCurrent] = useState(""); // dollars input
  const [deadlineAt, setDeadlineAt] = useState(""); // yyyy-mm-dd
  const [notes, setNotes] = useState("");

  // Update form (progress add/subtract)
  const [delta, setDelta] = useState("");
  const [deltaNote, setDeltaNote] = useState("");
  const deltaRef = useRef<HTMLInputElement | null>(null);
  const householdIdRef = useRef<string | null>(null);

  const refreshActiveHousehold = useCallback(async () => {
    if (!userId) {
      householdIdRef.current = null;
      setHouseholdId(null);
      setGoals([]);
      setUpdates([]);
      setSelectedGoalId(null);
      return;
    }

    try {
      const hid = await resolveActiveHouseholdIdClient(supabase, userId);
      const prev = householdIdRef.current;
      if (prev !== hid) {
        setGoals([]);
        setUpdates([]);
        setSelectedGoalId(null);
      }
      householdIdRef.current = hid;
      setHouseholdId(hid);
    } catch {
      const prev = householdIdRef.current;
      if (prev !== null) {
        setGoals([]);
        setUpdates([]);
        setSelectedGoalId(null);
      }
      householdIdRef.current = null;
      setHouseholdId(null);
    }
  }, [userId]);

  // --- Auth ---
  useEffect(() => {
    let alive = true;

    (async () => {
      setAuthStatus("loading");
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        householdIdRef.current = null;
        setHouseholdId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshActiveHousehold();
  }, [userId, refreshActiveHousehold]);

  useEffect(() => {
    const onActiveHouseholdChanged = () => {
      void refreshActiveHousehold();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACTIVE_HOUSEHOLD_STORAGE_KEY) return;
      void refreshActiveHousehold();
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
  }, [refreshActiveHousehold]);

  const sortedGoals = useMemo(() => sortGoals(goals), [goals]);
  const primaryGoal = useMemo(() => sortedGoals.find((g) => !!g.is_primary) ?? null, [sortedGoals]);

  const selectedGoal = useMemo(() => {
    if (!selectedGoalId) return null;
    return goals.find((g) => g.id === selectedGoalId) ?? null;
  }, [goals, selectedGoalId]);

  const goalsSupportPrimary = useMemo(() => hasPrimarySupport(goals), [goals]);

  const resetForm = () => {
    setTitle("");
    setCurrency("AUD");
    setTarget("");
    setCurrent("");
    setDeadlineAt("");
    setNotes("");
    setEditingId(null);
    setCreating(false);
  };

  const beginCreate = () => {
    resetForm();
    setCreating(true);
    setEditingId(null);
  };

  const beginEdit = (g: MoneyGoal) => {
    setCreating(false);
    setEditingId(g.id);
    setTitle(String(g.title ?? "").trim());
    setCurrency(String(g.currency ?? "AUD").toUpperCase() || "AUD");

    const t = toInt(g.target_cents);
    const c = toInt(g.current_cents);
    setTarget(t == null ? "" : String((t / 100).toFixed(0)));
    setCurrent(c == null ? "" : String((c / 100).toFixed(0)));

    // deadline_at might be ISO. Convert to yyyy-mm-dd for input.
    const dIso = typeof g.deadline_at === "string" ? g.deadline_at : "";
    if (dIso) {
      const ms = Date.parse(dIso);
      if (!Number.isNaN(ms)) {
        const d = new Date(ms);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setDeadlineAt(`${yyyy}-${mm}-${dd}`);
      } else {
        setDeadlineAt("");
      }
    } else {
      setDeadlineAt("");
    }

    setNotes(String(g.notes ?? ""));
  };

  async function loadGoals(hid: string) {
    setLoadingGoals(true);
    try {
      const res = await supabase.from("money_goals").select("*").eq("household_id", hid);
      if (res.error) throw res.error;

      const rows = (res.data ?? []) as MoneyGoal[];
      const cleaned = rows.map((r) => ({
        ...r,
        status: normalizeStatus((r as any).status),
        currency: String(r.currency ?? "AUD").toUpperCase(),
      }));

      const ordered = sortGoals(cleaned);
      setGoals(ordered);

      // sensible selection default
      if (!selectedGoalId && ordered.length > 0) {
        const pick = ordered.find((g) => normalizeStatus(g.status) === "active") ?? ordered[0];
        setSelectedGoalId(pick.id);
      } else if (selectedGoalId) {
        const stillExists = ordered.some((g) => g.id === selectedGoalId);
        if (!stillExists) setSelectedGoalId(ordered[0]?.id ?? null);
      }
    } catch (e: any) {
      notify({ title: "Couldn’t load goals", description: e?.message ?? "Unknown error" });
      setGoals([]);
    } finally {
      setLoadingGoals(false);
    }
  }

  async function loadUpdates(hid: string, goalId: string) {
    setLoadingUpdates(true);
    try {
      const res = await supabase
        .from("money_goal_updates")
        .select("*")
        .eq("household_id", hid)
        .eq("goal_id", goalId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (res.error) {
        setUpdates([]);
        setLoadingUpdates(false);
        return;
      }

      setUpdates((res.data ?? []) as GoalUpdate[]);
    } catch {
      setUpdates([]);
    } finally {
      setLoadingUpdates(false);
    }
  }

  useEffect(() => {
    if (!userId || !householdId) return;
    void loadGoals(householdId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, householdId]);

  useEffect(() => {
    if (!userId || !householdId || !selectedGoalId) {
      setUpdates([]);
      return;
    }
    void loadUpdates(householdId, selectedGoalId);
  }, [userId, householdId, selectedGoalId]);

  const activeGoals = useMemo(() => sortedGoals.filter((g) => normalizeStatus(g.status) === "active"), [sortedGoals]);
  const pausedGoals = useMemo(() => sortedGoals.filter((g) => normalizeStatus(g.status) === "paused"), [sortedGoals]);
  const doneGoals = useMemo(() => sortedGoals.filter((g) => normalizeStatus(g.status) === "done"), [sortedGoals]);
  const archivedGoals = useMemo(() => sortedGoals.filter((g) => normalizeStatus(g.status) === "archived"), [sortedGoals]);

  const selectedComputed = useMemo(() => {
    if (!selectedGoal) return null;
    const cur = toInt(selectedGoal.current_cents) ?? 0;
    const tgt = toInt(selectedGoal.target_cents) ?? 0;
    const curStr = moneyFromCents(cur, selectedGoal.currency);
    const tgtStr = tgt > 0 ? moneyFromCents(tgt, selectedGoal.currency) : "—";
    const p = tgt > 0 ? percent(cur, tgt) : 0;
    const remaining = tgt > 0 ? Math.max(0, tgt - cur) : null;
    return {
      cur,
      tgt,
      curStr,
      tgtStr,
      p,
      remaining,
      remainingStr: remaining == null ? "—" : moneyFromCents(remaining, selectedGoal.currency),
    };
  }, [selectedGoal]);

  async function upsertGoal() {
    if (!userId || !householdId) return;

    const t = title.trim();
    if (!t) {
      notify({ title: "Missing title", description: "Give this goal a short name." });
      return;
    }

    // Your DB requires NOT NULL, so "no target" becomes 0 (save-as-much-as-possible mode)
    const targetCentsRaw = parseMoneyToCents(target);
    const currentCentsRaw = parseMoneyToCents(current);

    if (target && targetCentsRaw == null) {
      notify({ title: "Target looks off", description: "Enter a number like 10000 or 10000.50" });
      return;
    }
    if (current && currentCentsRaw == null) {
      notify({ title: "Progress looks off", description: "Enter a number like 1200 or 1200.50" });
      return;
    }

    const targetCents = targetCentsRaw ?? 0;
    const currentCents = currentCentsRaw ?? 0;

    if (target && targetCents == null) {
      notify({ title: "Target looks off", description: "Enter a number like 10000 or 10000.50" });
      return;
    }
    if (current && currentCents == null) {
      notify({ title: "Progress looks off", description: "Enter a number like 1200 or 1200.50" });
      return;
    }

    // Deadline: if yyyy-mm-dd, store as ISO (9am local to avoid midnight TZ weirdness)
    let deadlineIso: string | null = null;
    if (deadlineAt.trim()) {
      const parts = deadlineAt.trim().split("-");
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);
        if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
          const dt = new Date(y, m - 1, d, 9, 0, 0, 0);
          deadlineIso = dt.toISOString();
        }
      }
    }

    const payload: any = {
      household_id: householdId,
      user_id: userId,
      title: t,
      currency: (currency || "AUD").toUpperCase(),
      target_cents: targetCents,
      current_cents: currentCents,
      // keep both if both columns exist (harmless if one is ignored by your select("*"))
      target_date: deadlineAt.trim() ? deadlineAt.trim() : null,
      deadline_at: deadlineIso,
      notes: notes.trim() ? notes.trim() : null,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    if (editingId) payload.id = editingId;

    try {
      const res = await supabase.from("money_goals").upsert([payload]).select("*").maybeSingle();
      if (res.error) throw res.error;

      notify({ title: editingId ? "Updated" : "Created", description: "Saved." });

      resetForm();

      await loadGoals(householdId);
      const savedId = String((res.data as any)?.id ?? editingId ?? "");
      if (savedId) setSelectedGoalId(savedId);
    } catch (e: any) {
      notify({ title: "Couldn’t save", description: e?.message ?? "Unknown error" });
    }
  }

  async function setGoalStatus(goal: MoneyGoal, status: GoalStatus) {
    if (!userId || !householdId) return;

    try {
      const res = await supabase
        .from("money_goals")
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("household_id", householdId)
        .eq("id", goal.id);

      if (res.error) throw res.error;

      await loadGoals(householdId);
      notify({ title: "Saved", description: "Updated." });
    } catch (e: any) {
      notify({ title: "Couldn’t update", description: e?.message ?? "Unknown error" });
    }
  }

  async function deleteGoal(goal: MoneyGoal) {
    if (!userId || !householdId) return;

    const status = normalizeStatus(goal.status);
    if (status !== "archived") {
      await setGoalStatus(goal, "archived");
      return;
    }

    try {
      // best-effort: remove updates too
      try {
        await supabase.from("money_goal_updates").delete().eq("household_id", householdId).eq("goal_id", goal.id);
      } catch {}

      const res = await supabase.from("money_goals").delete().eq("household_id", householdId).eq("id", goal.id);
      if (res.error) throw res.error;

      notify({ title: "Removed", description: "Deleted." });
      await loadGoals(householdId);
      setSelectedGoalId((prev) => (prev === goal.id ? null : prev));
    } catch (e: any) {
      notify({ title: "Couldn’t delete", description: e?.message ?? "Unknown error" });
    }
  }

  async function markPrimary(goal: MoneyGoal) {
    if (!userId || !householdId) return;

    try {
      // 1) clear all
      const clearRes = await supabase.from("money_goals").update({ is_primary: false } as any).eq("household_id", householdId);
      if (clearRes.error) throw clearRes.error;

      // 2) set one
      const setRes = await supabase
        .from("money_goals")
        .update({ is_primary: true, updated_at: new Date().toISOString() } as any)
        .eq("household_id", householdId)
        .eq("id", goal.id);

      if (setRes.error) throw setRes.error;

      await loadGoals(householdId);
      notify({ title: "Primary goal set", description: "Pinned." });
    } catch {
      notify({
        title: "Primary goal not available",
        description: "If you want this feature, run the optional migration that adds is_primary.",
      });
    }
  }

  async function applyDeltaCents(goal: MoneyGoal, deltaCents: number, note: string | null) {
    if (!userId || !householdId) return;

    const cur = toInt(goal.current_cents) ?? 0;
    const next = Math.max(0, cur + deltaCents);

    const updRes = await supabase
      .from("money_goals")
      .update({ current_cents: next, updated_at: new Date().toISOString() } as any)
      .eq("household_id", householdId)
      .eq("id", goal.id);

    if (updRes.error) {
      notify({ title: "Couldn’t update progress", description: updRes.error.message });
      return;
    }

    // Best-effort: append update row (optional table)
    try {
      const ins = await supabase.from("money_goal_updates").insert([
        {
          household_id: householdId,
          user_id: userId,
          goal_id: goal.id,
          delta_cents: deltaCents,
          note: note ? note : null,
          run_id: safeUUID(),
        } as any,
      ]);
      if (ins.error) {
        // ignore silently (progress still saved)
      }
    } catch {
      // ignore
    }

    await loadGoals(householdId);
    if (selectedGoalId === goal.id) {
      await loadUpdates(householdId, goal.id);
    }

    notify({ title: "Saved", description: "Progress updated." });
  }

  async function addProgress() {
    if (!userId || !selectedGoal) return;

    const cents = parseMoneyToCents(delta);
    if (cents == null) {
      notify({ title: "Enter an amount", description: "Example: 50 or 50.00 (use - to subtract)" });
      return;
    }
    if (cents === 0) return;

    const note = deltaNote.trim() ? deltaNote.trim() : null;
    setDelta("");
    setDeltaNote("");
    await applyDeltaCents(selectedGoal, cents, note);
    window.setTimeout(() => deltaRef.current?.focus(), 0);
  }

  async function quickAdd(amountDollars: number) {
    if (!selectedGoal) return;
    await applyDeltaCents(selectedGoal, Math.round(amountDollars * 100), null);
  }

  async function quickSubtract(amountDollars: number) {
    if (!selectedGoal) return;
    await applyDeltaCents(selectedGoal, -Math.round(amountDollars * 100), null);
  }

  const subtitle = "Goals and Planned work together for future money decisions.";

  if (authStatus === "loading") {
    return (
      <Page title="Goals" subtitle={subtitle}>
        <div className="mx-auto w-full max-w-[900px]">
          <Card className="border-zinc-200 bg-white shadow-none">
            <CardContent className="p-0">
              <div className="px-6 py-5">
                <div className="flex items-center gap-2">
                  <Chip>Loading…</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Page>
    );
  }

  if (authStatus === "signed_out" || !userId) {
    return (
      <Page title="Goals" subtitle={subtitle}>
        <div className="mx-auto w-full max-w-[900px]">
          <Card className="border-zinc-200 bg-white shadow-none">
            <CardContent className="p-0">
              <div className="px-6 py-5">
                <div className="text-[15px] leading-relaxed text-zinc-800">Sign in to use Goals.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Page>
    );
  }

  const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {right}
    </div>
  );

  const GoalRow = ({ g }: { g: MoneyGoal }) => {
    const cur = toInt(g.current_cents) ?? 0;
    const tgt = toInt(g.target_cents) ?? 0;
    const p = tgt > 0 ? percent(cur, tgt) : 0;
    const status = normalizeStatus(g.status);
    const isSelected = selectedGoalId === g.id;

    const pill =
      status === "active" ? (
        <Badge>Active</Badge>
      ) : status === "paused" ? (
        <Badge>Paused</Badge>
      ) : status === "done" ? (
        <Badge>Done</Badge>
      ) : (
        <Badge>Archived</Badge>
      );

    return (
      <button
        type="button"
        onClick={() => setSelectedGoalId(g.id)}
        className={[
          "w-full rounded-2xl border px-4 py-3 text-left transition",
          "shadow-none",
          isSelected ? "border-zinc-300 bg-white" : "border-zinc-200 bg-white hover:border-zinc-300",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="truncate text-[15px] font-semibold text-zinc-900">
                {String(g.title ?? "Goal").trim() || "Goal"}
              </div>
              {g.is_primary ? <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Primary</Chip> : null}
              {pill}
            </div>

            <div className="mt-1 text-xs text-zinc-600">
              {tgt > 0 ? (
                <>
                  {moneyFromCents(cur, g.currency)} / {moneyFromCents(tgt, g.currency)} • {p}%
                </>
              ) : (
                <>{moneyFromCents(cur, g.currency)} saved</>
              )}
              {g.deadline_at ? <span> • target by {fmtDateShort(g.deadline_at)}</span> : null}
            </div>
          </div>

          <div className="shrink-0 text-xs text-zinc-500">{isSelected ? "Selected" : "Open"}</div>
        </div>

        {tgt > 0 ? (
          <div className="mt-3 h-2 w-full rounded-full bg-zinc-100">
            <div className="h-2 rounded-full bg-zinc-300" style={{ width: `${clamp(p, 0, 100)}%` }} />
          </div>
        ) : null}
      </button>
    );
  };

  const statusPill = (s: GoalStatus) =>
    s === "active" ? "Active" : s === "paused" ? "Paused" : s === "done" ? "Done" : "Archived";

  const selectedStatus = selectedGoal ? normalizeStatus(selectedGoal.status) : "active";

  const canShowDelta = !!selectedGoal && selectedStatus !== "archived";
  const canEditSelected = !!selectedGoal;
  const canPinSelected = !!selectedGoal && goalsSupportPrimary;

  const selectedIsPrimary = !!selectedGoal?.is_primary;

  return (
    <Page
      title="Goals"
      subtitle={subtitle}
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <Chip
            onClick={() => {
              router.push("/money");
              router.refresh();
            }}
            title="Back to Money"
            className="border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            Money
          </Chip>
          <Chip onClick={() => router.push("/money/planned")} title="Open Planned">
            Planned
          </Chip>
          <Chip onClick={() => router.push("/bills")} title="Open Bills">
            Bills
          </Chip>

          <Button onClick={beginCreate} disabled={creating || !!editingId} className="rounded-2xl">
            New goal
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[900px] space-y-4">
        {/* Focus spotlight */}
        <Card className="border-zinc-200 bg-white shadow-none">
          <CardContent className="p-0">
            <div className="px-6 py-5">
              <SectionHeader
                title="Focus"
                right={
                  <div className="flex items-center gap-2">
                    {loadingGoals ? <Chip>Updating…</Chip> : <Chip>{sortedGoals.length} goals</Chip>}
                  </div>
                }
              />

              <div className="mt-3">
                {primaryGoal && normalizeStatus(primaryGoal.status) === "active" ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-zinc-900 truncate">
                          {String(primaryGoal.title ?? "Goal").trim() || "Goal"}
                        </div>

                        <div className="mt-1 text-xs text-zinc-600">
                          {toInt(primaryGoal.target_cents) ? (
                            <>
                              {moneyFromCents(toInt(primaryGoal.current_cents) ?? 0, primaryGoal.currency)} /{" "}
                              {moneyFromCents(toInt(primaryGoal.target_cents) ?? 0, primaryGoal.currency)}
                            </>
                          ) : (
                            <>{moneyFromCents(toInt(primaryGoal.current_cents) ?? 0, primaryGoal.currency)} saved</>
                          )}
                          {primaryGoal.deadline_at ? <span> • target by {fmtDateShort(primaryGoal.deadline_at)}</span> : null}
                        </div>

                        {toInt(primaryGoal.target_cents) ? (
                          <div className="mt-3 h-2 w-full rounded-full bg-zinc-100">
                            <div
                              className="h-2 rounded-full bg-zinc-300"
                              style={{
                                width: `${clamp(
                                  percent(toInt(primaryGoal.current_cents) ?? 0, toInt(primaryGoal.target_cents) ?? 0),
                                  0,
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Chip onClick={() => setSelectedGoalId(primaryGoal.id)} className="text-xs" title="Open details">
                          Open
                        </Chip>
                        <Chip onClick={() => beginEdit(primaryGoal)} className="text-xs" title="Edit">
                          Edit
                        </Chip>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-[15px] leading-relaxed text-zinc-800">This is a calm anchor — not a dashboard.</div>
                    <div className="mt-2 text-xs text-zinc-600">
                      You can run multiple goals at once. If you enable “Primary”, Keystone can keep one goal in focus.
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Multiple at once</Chip>
                      {!goalsSupportPrimary ? (
                        <Chip
                          className="text-xs border-zinc-200 bg-white text-zinc-700"
                          title="Run the optional migration to add is_primary"
                        >
                          Primary not enabled
                        </Chip>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-none">
          <CardContent className="p-0">
            <div className="px-6 py-5">
              <SectionHeader title="Planned and goals" right={<Chip className="text-xs">Keep it short</Chip>} />
              <div className="mt-3 space-y-2 text-xs text-zinc-700">
                <div>
                  Goals work best when they sit beside upcoming commitments and due dates.
                </div>
                <div>
                  Use Planned to check timing pressure, then use Goals to track what you want to set aside.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip onClick={() => router.push("/money/planned")} className="text-xs" title="Open Planned">
                  Planned
                </Chip>
                <Chip onClick={() => router.push("/bills")} className="text-xs" title="Open Bills">
                  Bills
                </Chip>
                <Chip onClick={() => router.push("/transactions")} className="text-xs" title="Open Transactions">
                  Transactions
                </Chip>
                <Chip onClick={() => router.push("/connections")} className="text-xs" title="Open Connections">
                  Connections
                </Chip>
                <Chip onClick={() => router.push("/money")} className="text-xs" title="Open Money">
                  Money
                </Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create / Edit */}
        {(creating || editingId) && (
          <Card className="border-zinc-200 bg-white shadow-none">
            <CardContent className="p-0">
              <div className="px-6 py-5">
                <SectionHeader title={editingId ? "Edit goal" : "New goal"} />

                <div className="mt-3 grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-6">
                    <div className="text-xs text-zinc-600 mb-1">Name</div>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. $100k buffer"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-600 mb-1">Currency</div>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      placeholder="AUD"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-600 mb-1">Target</div>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="100000"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-600 mb-1">Already saved</div>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <div className="text-xs text-zinc-600 mb-1">Target date (optional)</div>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={deadlineAt}
                      onChange={(e) => setDeadlineAt(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-8">
                    <div className="text-xs text-zinc-600 mb-1">Notes (optional)</div>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What does this protect or unlock?"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => void upsertGoal()} className="rounded-2xl">
                      {editingId ? "Save changes" : "Create goal"}
                    </Button>
                    <Button variant="secondary" onClick={resetForm} className="rounded-2xl">
                      Cancel
                    </Button>
                  </div>

                  <div className="text-xs text-zinc-500">Start simple. You can refine later without losing the point.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Two-column layout */}
        <div className="grid gap-4 md:grid-cols-12">
          {/* Goals list */}
          <div className="md:col-span-5">
            <Card className="border-zinc-200 bg-white shadow-none">
              <CardContent className="p-0">
                <div className="px-6 py-5">
                  <SectionHeader
                    title="Your goals"
                    right={
                      <div className="flex items-center gap-2">
                        {loadingGoals ? <Chip>Updating…</Chip> : null}
                        <Chip className="text-xs">Multiple at once</Chip>
                      </div>
                    }
                  />

                  <div className="mt-3 space-y-3">
                    {sortedGoals.length === 0 ? (
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-[15px] leading-relaxed text-zinc-800">No goals yet.</div>
                        <div className="mt-2 text-xs text-zinc-600">A goal is just a promise you can keep seeing.</div>
                        <div className="mt-3">
                          <Button onClick={beginCreate} className="rounded-2xl">
                            Create your first goal
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {activeGoals.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-zinc-900">Active</div>
                            {activeGoals.map((g) => (
                              <GoalRow key={g.id} g={g} />
                            ))}
                          </div>
                        ) : null}

                        {pausedGoals.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <div className="text-xs font-semibold text-zinc-900">Paused</div>
                            {pausedGoals.map((g) => (
                              <GoalRow key={g.id} g={g} />
                            ))}
                          </div>
                        ) : null}

                        {doneGoals.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <div className="text-xs font-semibold text-zinc-900">Done</div>
                            {doneGoals.map((g) => (
                              <GoalRow key={g.id} g={g} />
                            ))}
                          </div>
                        ) : null}

                        {archivedGoals.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <div className="text-xs font-semibold text-zinc-900">Archived</div>
                            {archivedGoals.map((g) => (
                              <GoalRow key={g.id} g={g} />
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Selected goal detail */}
          <div className="md:col-span-7">
            <Card className="border-zinc-200 bg-white shadow-none">
              <CardContent className="p-0">
                <div className="px-6 py-5">
                  <SectionHeader
                    title="Details"
                    right={
                      selectedGoal ? (
                        <Chip className="text-xs">{statusPill(selectedStatus)}</Chip>
                      ) : (
                        <Chip className="text-xs">Select one</Chip>
                      )
                    }
                  />

                  {!selectedGoal ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="text-[15px] leading-relaxed text-zinc-800">Choose a goal on the left.</div>
                      <div className="mt-2 text-xs text-zinc-600">This is designed to feel like a calm anchor.</div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {/* Summary card */}
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[16px] font-semibold text-zinc-900 truncate">
                              {String(selectedGoal.title ?? "Goal").trim() || "Goal"}
                            </div>

                            <div className="mt-1 text-xs text-zinc-600">
                              {selectedStatus}
                              {selectedGoal.deadline_at ? <span> • target by {fmtDateShort(selectedGoal.deadline_at)}</span> : null}
                              {selectedIsPrimary ? <span> • primary</span> : null}
                            </div>

                            <div className="mt-3 grid gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-zinc-600">Saved so far</div>
                                <div className="text-xs font-semibold text-zinc-900">{selectedComputed?.curStr}</div>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-zinc-600">Target</div>
                                <div className="text-xs font-semibold text-zinc-900">{selectedComputed?.tgtStr}</div>
                              </div>

                              {selectedComputed?.remaining != null ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs text-zinc-600">Remaining</div>
                                  <div className="text-xs font-semibold text-zinc-900">{selectedComputed?.remainingStr}</div>
                                </div>
                              ) : null}
                            </div>

                            {/* Progress bar */}
                            {selectedComputed && selectedComputed.tgt > 0 ? (
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-xs text-zinc-600">
                                  <span>{selectedComputed.p}%</span>
                                  <span>{moneyFromCents(selectedComputed.tgt, selectedGoal.currency)}</span>
                                </div>
                                <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
                                  <div className="h-2 rounded-full bg-zinc-300" style={{ width: `${clamp(selectedComputed.p, 0, 100)}%` }} />
                                </div>
                              </div>
                            ) : null}

                            {selectedGoal.notes ? (
                              <div className="mt-3 text-[13px] leading-relaxed text-zinc-700 whitespace-pre-wrap">{String(selectedGoal.notes)}</div>
                            ) : null}
                          </div>

                          {/* Top right actions */}
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              {canPinSelected ? (
                                <Chip
                                  onClick={() => void markPrimary(selectedGoal)}
                                  className="text-xs"
                                  title={selectedIsPrimary ? "Primary already" : "Set as primary"}
                                >
                                  {selectedIsPrimary ? "Primary" : "Set primary"}
                                </Chip>
                              ) : null}

                              {canEditSelected ? (
                                <Chip onClick={() => beginEdit(selectedGoal)} className="text-xs" title="Edit">
                                  Edit
                                </Chip>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress update */}
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <SectionHeader
                          title="Progress"
                          right={
                            canShowDelta ? (
                              <div className="flex items-center gap-2">
                                <Chip className="text-xs" title="Use - to subtract">
                                  + / -
                                </Chip>
                                {loadingUpdates ? <Chip className="text-xs">Updating…</Chip> : null}
                              </div>
                            ) : (
                              <Chip className="text-xs">Archived</Chip>
                            )
                          }
                        />

                        {canShowDelta ? (
                          <>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Chip onClick={() => void quickAdd(10)} className="text-xs" title="Add $10">
                                +$10
                              </Chip>
                              <Chip onClick={() => void quickAdd(50)} className="text-xs" title="Add $50">
                                +$50
                              </Chip>
                              <Chip onClick={() => void quickAdd(200)} className="text-xs" title="Add $200">
                                +$200
                              </Chip>
                              <Chip onClick={() => void quickAdd(1000)} className="text-xs" title="Add $1000">
                                +$1000
                              </Chip>

                              <div className="w-px h-5 bg-zinc-100 mx-1" />

                              <Chip onClick={() => void quickSubtract(10)} className="text-xs" title="Subtract $10">
                                -$10
                              </Chip>
                              <Chip onClick={() => void quickSubtract(50)} className="text-xs" title="Subtract $50">
                                -$50
                              </Chip>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-12">
                              <div className="md:col-span-4">
                                <div className="text-xs text-zinc-600 mb-1">Amount</div>
                                <input
                                  ref={deltaRef}
                                  className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                                  value={delta}
                                  onChange={(e) => setDelta(e.target.value)}
                                  placeholder="e.g. 50 or -20"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void addProgress();
                                    }
                                  }}
                                />
                              </div>

                              <div className="md:col-span-8">
                                <div className="text-xs text-zinc-600 mb-1">Note (optional)</div>
                                <input
                                  className="w-full rounded-2xl border border-zinc-200 px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-zinc-200"
                                  value={deltaNote}
                                  onChange={(e) => setDeltaNote(e.target.value)}
                                  placeholder="e.g. sold marketplace items"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void addProgress();
                                    }
                                  }}
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                              <Button onClick={() => void addProgress()} className="rounded-2xl">
                                Save progress
                              </Button>
                              <div className="text-xs text-zinc-500">This updates the goal total. Updates feed is best-effort.</div>
                            </div>

                            {/* Recent updates */}
                            <div className="mt-4">
                              <div className="text-xs font-semibold text-zinc-900 mb-2">Recent</div>

                              {updates.length === 0 ? (
                                <div className="text-xs text-zinc-600">No updates recorded yet.</div>
                              ) : (
                                <div className="space-y-2">
                                  {updates.slice(0, 8).map((u) => {
                                    const when = u.created_at ? relativeDayLabel(u.created_at) : "—";
                                    const sign = u.delta_cents >= 0 ? "+" : "−";
                                    const amt = moneyFromCents(Math.abs(u.delta_cents), selectedGoal.currency);
                                    return (
                                      <div key={u.id} className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                        <div className="min-w-0">
                                          <div className="text-xs text-zinc-900">
                                            <span className="font-semibold">{sign + amt}</span>
                                            {u.note ? <span className="text-zinc-700"> — {u.note}</span> : null}
                                          </div>
                                          <div className="text-[11px] text-zinc-500 mt-0.5">{when}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="mt-3 text-sm text-zinc-700">This goal is archived. Restore it to update progress.</div>
                        )}
                      </div>

                      {/* Status + safety */}
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <SectionHeader title="State" right={<Chip className="text-xs">Safe changes</Chip>} />

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Chip onClick={() => void setGoalStatus(selectedGoal, "active")} className="text-xs" title="Mark active">
                            Active
                          </Chip>
                          <Chip onClick={() => void setGoalStatus(selectedGoal, "paused")} className="text-xs" title="Pause this goal">
                            Pause
                          </Chip>
                          <Chip onClick={() => void setGoalStatus(selectedGoal, "done")} className="text-xs" title="Mark done">
                            Done
                          </Chip>
                          <Chip onClick={() => void setGoalStatus(selectedGoal, "archived")} className="text-xs" title="Archive">
                            Archive
                          </Chip>

                          <div className="w-px h-5 bg-zinc-100 mx-1" />

                          <Chip
                            onClick={() => void deleteGoal(selectedGoal)}
                            className="text-xs border-rose-200 bg-rose-50 text-rose-700"
                            title="Archive (or delete if already archived)"
                          >
                            Remove
                          </Chip>
                        </div>

                        <div className="mt-2 text-xs text-zinc-500">“Remove” will archive first. Only archived goals are deleted.</div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Page>
  );
}
