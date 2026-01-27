// app/(app)/investments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Badge, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

export const dynamic = "force-dynamic";

type InvestmentAccount = {
  id: string;
  user_id: string;
  name: string;
  kind: string | null; // e.g. "brokerage" | "super" | "crypto" | "property" | "other"
  institution: string | null; // e.g. Vanguard, Stake, Hostplus
  approx_value: number | null; // AUD by default
  currency: string | null; // "AUD"
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type LiveState = "connecting" | "live" | "offline";

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softDate(iso: string | null | undefined) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function toNumberOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function money(n: number | null | undefined, currency = "AUD") {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency || "AUD"} ${Math.round(n)}`;
  }
}

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "brokerage", label: "Brokerage" },
  { value: "super", label: "Super" },
  { value: "crypto", label: "Crypto" },
  { value: "property", label: "Property" },
  { value: "other", label: "Other" },
];

const LOAD_THROTTLE_MS = 1200;

export default function InvestmentsPage() {
  const router = useRouter();

  const toastApi: any = useToast();
  const showToast =
    toastApi?.showToast ??
    ((args: any) => {
      if (toastApi?.toast) {
        toastApi.toast({
          title: args?.title ?? "Done",
          description: args?.description ?? args?.message ?? "",
          variant: args?.variant,
          action: args?.action,
        });
      }
    });

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [live, setLive] = useState<LiveState>("connecting");

  const [items, setItems] = useState<InvestmentAccount[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // Add / edit panel
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("brokerage");
  const [institution, setInstitution] = useState("");
  const [approxValue, setApproxValue] = useState<string>("");
  const [currency, setCurrency] = useState<string>("AUD");
  const [notes, setNotes] = useState<string>("");

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // silent reload throttle
  const lastLoadAtRef = useRef<number>(0);
  const pendingSilentReloadRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedRefetchRef = useRef(false);
  const isMountedRef = useRef(true);

  const approxTotal = useMemo(() => {
    return items.reduce((sum, x) => sum + (typeof x.approx_value === "number" ? x.approx_value : 0), 0);
  }, [items]);

  const resetComposer = () => {
    setEditingId(null);
    setName("");
    setKind("brokerage");
    setInstitution("");
    setApproxValue("");
    setCurrency("AUD");
    setNotes("");
  };

  const hydrateComposerFrom = (it: InvestmentAccount) => {
    setEditingId(it.id);
    setName(it.name ?? "");
    setKind(it.kind ?? "brokerage");
    setInstitution(it.institution ?? "");
    setApproxValue(typeof it.approx_value === "number" ? String(it.approx_value) : "");
    setCurrency(it.currency ?? "AUD");
    setNotes(it.notes ?? "");
  };

  async function load(uid: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (silent) {
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) {
        if (pendingSilentReloadRef.current) window.clearTimeout(pendingSilentReloadRef.current);
        pendingSilentReloadRef.current = window.setTimeout(() => {
          pendingSilentReloadRef.current = null;
          void load(uid, { silent: true });
        }, LOAD_THROTTLE_MS);
        return;
      }
    }
    lastLoadAtRef.current = now;

    if (inFlightRef.current) {
      queuedRefetchRef.current = true;
      return;
    }

    inFlightRef.current = true;
    queuedRefetchRef.current = false;

    if (!silent) {
      setStatusLine("Loading…");
      setError(null);
    }

    try {
      const { data, error } = await supabase
        .from("investment_accounts")
        .select("id,user_id,name,kind,institution,approx_value,currency,notes,updated_at,created_at")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        setItems([]);
        setError(error.message);
        setStatusLine(`Needs setup: investment_accounts`);
        return;
      }

      const rows = (data ?? []) as any[];
      const normalized: InvestmentAccount[] = rows.map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        name: String(r.name ?? ""),
        kind: r.kind ?? null,
        institution: r.institution ?? null,
        approx_value: typeof r.approx_value === "number" ? r.approx_value : r.approx_value ? Number(r.approx_value) : null,
        currency: r.currency ?? "AUD",
        notes: r.notes ?? null,
        updated_at: r.updated_at ?? null,
        created_at: r.created_at ?? null,
      }));

      setItems(normalized);
      setStatusLine(normalized.length === 0 ? "No inputs yet." : "Loaded.");
    } catch (e: any) {
      setError(e?.message ?? "Load failed.");
      setStatusLine("Load failed.");
    } finally {
      inFlightRef.current = false;

      if (!isMountedRef.current) return;
      if (queuedRefetchRef.current) {
        queuedRefetchRef.current = false;
        void load(uid, { silent: true });
      }
    }
  }

  // ----- boot -----
  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        setLive("offline");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);
      await load(uid);
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- realtime -----
  useEffect(() => {
    if (!userId) return;

    setLive("connecting");

    const channel = supabase
      .channel(`investments_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "investment_accounts", filter: `user_id=eq.${userId}` }, () =>
        void load(userId, { silent: true })
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
        else setLive("connecting");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // focus refresh (silent)
  useEffect(() => {
    const onFocus = () => {
      if (!userId) return;
      void load(userId, { silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  const canSave = useMemo(() => !!userId && name.trim().length > 0 && !working, [userId, name, working]);

  async function save() {
    if (!userId || !canSave) return;

    setWorking(true);
    setStatusLine("Saving…");

    try {
      const base = {
        user_id: userId,
        name: name.trim(),
        kind: kind.trim() || null,
        institution: institution.trim() || null,
        approx_value: toNumberOrNull(approxValue),
        currency: (currency || "AUD").trim() || "AUD",
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      // IMPORTANT: don’t send id: undefined
      const payload = editingId ? { id: editingId, ...base } : base;

      const { error } = await supabase.from("investment_accounts").upsert(payload as any, { onConflict: "id" });
      if (error) throw error;

      setStatusLine(editingId ? "Updated." : "Saved.");
      setComposeOpen(false);
      resetComposer();
      void load(userId, { silent: true });
    } catch (e: any) {
      setStatusLine(e?.message ? String(e.message) : "Couldn’t save.");
    } finally {
      setWorking(false);
    }
  }

  async function remove(it: InvestmentAccount) {
    if (!userId || working) return;

    const snapshot = items;

    // optimistic UI
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    setOpenId((cur) => (cur === it.id ? null : cur));
    setStatusLine("Removed.");

    showToast({
      message: `"${it.name}" removed.`,
      undoLabel: "Undo",
      onUndo: async () => {
        setItems(snapshot);
        void load(userId, { silent: true });
      },
    });

    try {
      const { error } = await supabase.from("investment_accounts").delete().eq("id", it.id).eq("user_id", userId);
      if (error) throw error;
    } catch (e: any) {
      notify({ title: "Error", description: e?.message ?? "Couldn’t remove." });
      setItems(snapshot);
      void load(userId, { silent: true });
    }
  }

  const beginEdit = (it: InvestmentAccount) => {
    hydrateComposerFrom(it);
    setComposeOpen(true);
    setOpenId(it.id);
  };

  const liveChipClass =
    live === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  // V1 calm list: top 5, show all on demand
  const LIMIT = 5;
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <Page
      title="Investments"
      subtitle="Inputs only. This will feed Home orientation later."
      right={
        <div className="flex items-center gap-2">
          <Chip className={liveChipClass}>{live === "live" ? "Live" : live === "offline" ? "Offline" : "Connecting"}</Chip>
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          {userId ? (
            <Chip onClick={() => void load(userId)} title="Refresh">
              Refresh
            </Chip>
          ) : null}
          <Chip
            onClick={() => {
              setComposeOpen((v) => {
                const next = !v;
                if (next && !editingId) resetComposer();
                return next;
              });
            }}
            title="Add an investment input"
          >
            {composeOpen ? "Hide" : "Add"}
          </Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        {/* Recognition-first search (quiet) */}
        <AssistedSearch scope="investments" placeholder="Search investments…" />

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {error ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-sm font-semibold text-zinc-900">Setup needed</div>
              <div className="mt-1 text-sm text-zinc-600">Keystone can’t read investment inputs yet.</div>
              <div className="mt-2 text-xs text-zinc-500">{error}</div>
            </CardContent>
          </Card>
        ) : null}

        {/* Calm total */}
        {items.length > 0 ? <div className="text-sm text-zinc-700">Approx total: {money(approxTotal, "AUD")}</div> : null}

        {/* Add / edit */}
        {composeOpen ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-zinc-900">{editingId ? "Edit investment input" : "Add investment input"}</div>
                    <div className="text-sm text-zinc-600">Rough is fine. This is for orientation, not accounting.</div>
                  </div>
                  <Chip
                    onClick={() => {
                      resetComposer();
                      setComposeOpen(false);
                    }}
                    title="Close"
                  >
                    {editingId ? "Cancel" : "Put this down"}
                  </Chip>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Name</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Stake portfolio, Hostplus super, Crypto wallet"
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Type</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {KIND_OPTIONS.map((kopt) => (
                      <Chip key={kopt.value} active={kind === kopt.value} onClick={() => setKind(kopt.value)}>
                        {kopt.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Institution (optional)</div>
                  <input
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Vanguard, Betashares, Hostplus, CommSec"
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">Approx value (optional)</div>
                    <input
                      value={approxValue}
                      onChange={(e) => setApproxValue(e.target.value)}
                      placeholder="e.g. 25000"
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">Currency</div>
                    <input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="AUD"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Notes (optional)</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Anything you’d want to remember (strategy, intention, constraints)…"
                    className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={() => void save()} title="Save this input" disabled={!canSave}>
                    {working ? "Working…" : editingId ? "Save changes" : "Save"}
                  </Chip>
                  <Chip
                    onClick={() => {
                      resetComposer();
                      setComposeOpen(false);
                    }}
                    title="Done"
                  >
                    Done
                  </Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Empty / list */}
        {items.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing here yet.</div>
                <div className="text-sm text-zinc-600">Add simple inputs (super, brokerage, crypto, property). This isn’t for spreadsheets — it’s for calm orientation.</div>
                <div className="pt-1">
                  <Chip onClick={() => setComposeOpen(true)}>Add an investment</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* V1 calm: top 5 + toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-zinc-500">
                {items.length} total
                {hiddenCount > 0 ? ` • ${hiddenCount} hidden` : ""}
              </div>
              {items.length > LIMIT ? (
                <Chip onClick={() => setShowAll((v) => !v)} title="Toggle list length">
                  {showAll ? "Show less" : "Show all"}
                </Chip>
              ) : null}
            </div>

            <div className="grid gap-3">
              {visibleItems.map((it) => {
                const isOpen = openId === it.id;

                return (
                  <Card key={it.id} className="border-zinc-200 bg-white">
                    <CardContent>
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : it.id)}
                        className="w-full text-left"
                        aria-expanded={isOpen}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[240px] flex-1">
                            <div className="text-base font-semibold text-zinc-900">{it.name}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {it.kind ? `Type: ${it.kind}` : "Investment input"}
                              {it.institution ? ` • ${it.institution}` : ""}
                              {typeof it.approx_value === "number" ? ` • ${money(it.approx_value, it.currency ?? "AUD")}` : ""}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {it.kind ? <Chip title="Type">{it.kind}</Chip> : null}
                              {it.updated_at ? <Chip title="Updated">{softDate(it.updated_at)}</Chip> : it.created_at ? <Chip title="Added">{softDate(it.created_at)}</Chip> : null}
                              {typeof it.approx_value === "number" ? <Badge>Valued</Badge> : <Badge>Unvalued</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                          </div>
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="mt-4 space-y-4">
                          {it.notes ? <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{it.notes}</div> : <div className="text-sm text-zinc-600">No notes.</div>}

                          <div className="flex flex-wrap items-center gap-2">
                            <Chip onClick={() => beginEdit(it)} title="Edit">
                              Edit
                            </Chip>
                            <Chip onClick={() => void remove(it)} title="Remove">
                              Remove
                            </Chip>
                            <Chip onClick={() => setOpenId(null)} title="Close">
                              Done
                            </Chip>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {hiddenCount > 0 ? <div className="text-xs text-zinc-500">{hiddenCount} more hidden — use search to find anything.</div> : null}
          </>
        )}
      </div>
    </Page>
  );
}
