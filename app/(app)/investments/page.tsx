// app/(app)/investments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
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
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // fallback
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

export default function InvestmentsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

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

  // throttle / reload protection (same pattern you’re using elsewhere)
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const queuedRefetchRef = useRef(false);

  const openItem = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

  const approxTotal = useMemo(() => {
    // Keep calm: optional quiet total; no charts.
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

  const load = async (uid: string) => {
    const now = Date.now();
    const elapsed = now - lastFetchAtRef.current;

    if (inFlightRef.current) {
      queuedRefetchRef.current = true;
      return;
    }

    if (elapsed < 700) {
      queuedRefetchRef.current = true;
      window.setTimeout(() => {
        if (!isMountedRef.current) return;
        if (!queuedRefetchRef.current) return;
        queuedRefetchRef.current = false;
        void load(uid);
      }, 750 - elapsed);
      return;
    }

    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    const { data, error } = await supabase
      .from("investment_accounts")
      .select("id,user_id,name,kind,institution,approx_value,currency,notes,updated_at,created_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    inFlightRef.current = false;

    if (!isMountedRef.current) return;

    if (error) {
      // Most likely: table not created yet.
      setItems([]);
      setStatusLine(`Needs setup: ${error.message}`);
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
  };

  // ----- boot -----
  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
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

    const channel = supabase
      .channel(`investments_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investment_accounts", filter: `user_id=eq.${userId}` },
        () => void load(userId)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const canSave = useMemo(() => {
    return !!userId && name.trim().length > 0 && !working;
  }, [userId, name, working]);

  const save = async () => {
    if (!userId || !canSave) return;

    setWorking(true);
    setStatusLine("Saving…");

    try {
      const payload = {
        id: editingId ?? undefined,
        user_id: userId,
        name: name.trim(),
        kind: kind.trim() || null,
        institution: institution.trim() || null,
        approx_value: toNumberOrNull(approxValue),
        currency: (currency || "AUD").trim() || "AUD",
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("investment_accounts").upsert(payload, { onConflict: "id" });

      if (error) throw error;

      setStatusLine(editingId ? "Updated." : "Saved.");
      setComposeOpen(false);
      resetComposer();
      if (userId) void load(userId);
    } catch (e: any) {
      setStatusLine(e?.message ? String(e.message) : "Couldn’t save.");
    } finally {
      setWorking(false);
    }
  };

  const remove = async (it: InvestmentAccount) => {
    if (!userId || working) return;

    setWorking(true);
    setStatusLine("Removing…");

    // optimistic
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    setOpenId((cur) => (cur === it.id ? null : cur));

    try {
      const { error } = await supabase.from("investment_accounts").delete().eq("id", it.id).eq("user_id", userId);
      if (error) throw error;

      setStatusLine("Removed.");
    } catch (e: any) {
      setStatusLine(e?.message ? String(e.message) : "Couldn’t remove.");
      void load(userId);
    } finally {
      setWorking(false);
    }
  };

  const beginEdit = (it: InvestmentAccount) => {
    hydrateComposerFrom(it);
    setComposeOpen(true);
    setOpenId(it.id);
  };

  return (
    <Page
      title="Investments"
      subtitle="Inputs only. This will feed Home orientation later."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
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
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Recognition-first search (quiet) */}
        <AssistedSearch scope="investments" placeholder="Search investments…" />

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {/* Calm “total” hint (optional) */}
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
                  <div className="flex items-center gap-2">
                    {editingId ? (
                      <Chip
                        onClick={() => {
                          resetComposer();
                          setComposeOpen(false);
                        }}
                        title="Stop editing"
                      >
                        Cancel
                      </Chip>
                    ) : (
                      <Chip
                        onClick={() => {
                          resetComposer();
                          setComposeOpen(false);
                        }}
                        title="Put this down"
                      >
                        Put this down
                      </Chip>
                    )}
                  </div>
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
                    {KIND_OPTIONS.map((k) => (
                      <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>
                        {k.label}
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
                  <Chip onClick={() => void save()} title="Save this input">
                    {working ? "Working…" : editingId ? "Save changes" : "Save"}
                  </Chip>
                  <Chip
                    onClick={() => {
                      resetComposer();
                      setComposeOpen(false);
                    }}
                    title="Close"
                  >
                    Done
                  </Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Empty state */}
        {items.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing here yet.</div>
                <div className="text-sm text-zinc-600">
                  Add simple inputs (super, brokerage, crypto, property). This isn’t for spreadsheets — it’s for calm orientation.
                </div>
                <div className="pt-1">
                  <Chip onClick={() => setComposeOpen(true)}>Add an investment</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {items.map((it) => {
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
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-4 space-y-4">
                        {it.notes ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{it.notes}</div>
                        ) : (
                          <div className="text-sm text-zinc-600">No notes.</div>
                        )}

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
        )}
      </div>
    </Page>
  );
}
