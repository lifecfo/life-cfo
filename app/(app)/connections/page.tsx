"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

type Connection = {
  id: string;
  provider: string;
  status: string;
  display_name: string | null;
  institution_name?: string | null;
  provider_institution_name?: string | null;
  last_sync_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

type PlaidLinkOnSuccessMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
  } | null;
};

type PlaidLinkOnExitMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
  } | null;
  status?: string | null;
  request_id?: string | null;
};

type PlaidHandler = {
  open: () => void;
  exit?: (options?: { force?: boolean }, callback?: () => void) => void;
  destroy?: () => void;
};

type PlaidFactory = {
  create: (options: {
    token: string;
    onSuccess: (
      publicToken: string,
      metadata: PlaidLinkOnSuccessMetadata
    ) => void | Promise<void>;
    onExit?: (
      err: { error_message?: string; error_code?: string; error_type?: string } | null,
      metadata: PlaidLinkOnExitMetadata
    ) => void;
  }) => PlaidHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidFactory;
  }
}

function softDate(d: string | null) {
  if (!d) return "";
  const parsed = Date.parse(d);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleDateString();
}

function coerceStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function pickRedirectUrl(json: any) {
  const consent = coerceStr(json?.consent_url);
  if (consent) return consent;

  const auth = coerceStr(json?.auth_link_url);
  if (auth) return auth;

  return "";
}

function safeErrMsg(json: any) {
  const step = coerceStr(json?.step);
  const err = coerceStr(json?.error);
  if (step && err) return `${step}: ${err}`;
  return err || "Request failed";
}

function providerLabel(provider: string) {
  const p = coerceStr(provider).toLowerCase();
  if (p === "plaid") return "Plaid";
  if (p === "basiq") return "Basiq";
  if (p === "manual") return "Manual";
  return p ? p.toUpperCase() : "Source";
}

function providerChipClass(provider: string) {
  const p = coerceStr(provider).toLowerCase();
  if (p === "plaid") return "border border-sky-200 bg-sky-50 text-sky-700";
  if (p === "basiq") return "border border-teal-200 bg-teal-50 text-teal-700";
  if (p === "manual") return "border border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border border-zinc-200 bg-zinc-50 text-zinc-700";
}

function sortConnections(items: Connection[]) {
  const rank = (c: Connection) => {
    if (c.status === "active") return 0;
    if (c.status === "needs_auth") return 1;
    if (c.status === "manual") return 2;
    if (c.status === "error") return 3;
    return 4;
  };

  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;

    const aTime = Date.parse(a.updated_at || a.created_at || "");
    const bTime = Date.parse(b.updated_at || b.created_at || "");
    const safeA = Number.isFinite(aTime) ? aTime : 0;
    const safeB = Number.isFinite(bTime) ? bTime : 0;

    return safeB - safeA;
  });
}

function displayTitle(c: Connection) {
  const institution =
    coerceStr(c.provider_institution_name) || coerceStr(c.institution_name);

  if (institution) return institution;
  if (coerceStr(c.display_name)) return coerceStr(c.display_name);
  return providerLabel(c.provider);
}

function syncLine(c: Connection) {
  if (c.status === "active") {
    if (c.last_sync_at) return `Last synced ${softDate(c.last_sync_at)}`;
    return "Connected";
  }

  if (c.status === "manual") return "Manual entry";
  if (c.status === "needs_auth") return "Awaiting connection";
  if (c.status === "error") return "Needs review";
  return "";
}

function connectionSubline(c: Connection) {
  const parts = [syncLine(c)];

  if (c.status === "active") {
    parts.push(`Connected via ${providerLabel(c.provider)}`);
  }

  return parts.filter(Boolean).join(" • ");
}

function institutionMonogram(name: string) {
  const words = name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() || "");
  return letters.join("") || "B";
}

function institutionIconClass(provider: string) {
  const p = coerceStr(provider).toLowerCase();
  if (p === "plaid") return "bg-sky-50 text-sky-700 border-sky-200";
  if (p === "basiq") return "bg-teal-50 text-teal-700 border-teal-200";
  if (p === "manual") return "bg-zinc-50 text-zinc-700 border-zinc-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

function isOlderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return false;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms > hours * 60 * 60 * 1000;
}

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid Link can only load in the browser."));
  }

  if (window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-plaid-link="true"]'
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Plaid Link.")),
        { once: true }
      );

      if (window.Plaid) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.defer = true;
    script.dataset.plaidLink = "true";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Plaid Link."));

    document.head.appendChild(script);
  });

  return plaidScriptPromise;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingManual, setCreatingManual] = useState(false);
  const [creatingBasiq, setCreatingBasiq] = useState(false);
  const [creatingPlaid, setCreatingPlaid] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [showAllRecentPending, setShowAllRecentPending] = useState(false);
  const [showOlderPending, setShowOlderPending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/money/connections", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Load failed");
      setItems(sortConnections(json.connections ?? []));
    } catch (e: any) {
      toast({ title: "Couldn’t load", description: e?.message });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createManual() {
    setCreatingManual(true);
    try {
      const res = await fetch("/api/money/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "manual" }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      toast({ title: "Connection added" });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn’t create", description: e?.message });
    } finally {
      setCreatingManual(false);
    }
  }

  async function startBasiqAuth(connectionId: string) {
    setConnectingId(connectionId);
    try {
      const res = await fetch("/api/money/basiq/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(safeErrMsg(json));

      const url = pickRedirectUrl(json);
      if (!url) throw new Error("Missing consent_url/auth_link_url");

      window.location.assign(url);
    } catch (e: any) {
      toast({ title: "Couldn’t start connection", description: e?.message });
      setConnectingId(null);
    }
  }

  async function createBasiqAndConnect() {
    setCreatingBasiq(true);
    try {
      const res = await fetch("/api/money/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "basiq",
          display_name: "Bank connection (AU)",
          currency: "AUD",
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      const connectionId = coerceStr(json?.connection?.id);
      if (!connectionId) throw new Error("Missing connection id");

      toast({ title: "Starting bank connection…" });
      await startBasiqAuth(connectionId);
    } catch (e: any) {
      toast({ title: "Couldn’t add bank", description: e?.message });
    } finally {
      setCreatingBasiq(false);
    }
  }

  async function startPlaidAuth(connectionId: string) {
    setConnectingId(connectionId);

    try {
      await loadPlaidScript();

      if (!window.Plaid) {
        throw new Error("Plaid Link is not available.");
      }

      const linkRes = await fetch("/api/money/plaid/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });

      const linkJson = await linkRes.json();
      if (!linkRes.ok) throw new Error(safeErrMsg(linkJson));

      const linkToken = coerceStr(linkJson?.link_token);
      if (!linkToken) throw new Error("Missing link token.");

      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const exchangeRes = await fetch("/api/money/plaid/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                connection_id: connectionId,
                public_token: publicToken,
                institution_id: metadata?.institution?.institution_id ?? null,
                institution_name: metadata?.institution?.name ?? null,
              }),
            });

            const exchangeJson = await exchangeRes.json();
            if (!exchangeRes.ok) {
              throw new Error(safeErrMsg(exchangeJson));
            }

            const syncRes = await fetch(`/api/money/sync/${connectionId}`, {
              method: "POST",
            });

            const syncJson = await syncRes.json();
            if (!syncRes.ok) {
              throw new Error(syncJson?.error || "Sync failed");
            }

            toast({ title: "Bank connected" });
            await load();
          } catch (e: any) {
            toast({ title: "Couldn’t finish connection", description: e?.message });
          } finally {
            setConnectingId(null);
            handler.destroy?.();
          }
        },
        onExit: (err) => {
          if (err?.error_message) {
            toast({
              title: "Connection cancelled",
              description: err.error_message,
            });
          }
          setConnectingId(null);
          handler.destroy?.();
        },
      });

      handler.open();
    } catch (e: any) {
      toast({ title: "Couldn’t start connection", description: e?.message });
      setConnectingId(null);
    }
  }

  async function createPlaidAndConnect() {
    setCreatingPlaid(true);
    try {
      const res = await fetch("/api/money/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "plaid",
          display_name: "Bank connection (US)",
          currency: "USD",
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      const connectionId = coerceStr(json?.connection?.id);
      if (!connectionId) throw new Error("Missing connection id");

      toast({ title: "Starting bank connection…" });
      await startPlaidAuth(connectionId);
    } catch (e: any) {
      toast({ title: "Couldn’t add bank", description: e?.message });
    } finally {
      setCreatingPlaid(false);
    }
  }

  async function syncConnection(id: string) {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/money/sync/${id}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Sync failed");

      toast({ title: "Synced" });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn’t sync", description: e?.message });
    } finally {
      setSyncingId(null);
    }
  }

  function statusChip(status: string) {
    const base = "text-xs rounded-full px-3 py-1 border";

    if (status === "manual") {
      return (
        <span className={`${base} border-zinc-200 bg-zinc-50 text-zinc-700`}>
          Manual
        </span>
      );
    }

    if (status === "needs_auth") {
      return (
        <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>
          Needs attention
        </span>
      );
    }

    if (status === "error") {
      return (
        <span className={`${base} border-rose-200 bg-rose-50 text-rose-700`}>
          Issue
        </span>
      );
    }

    return (
      <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        Active
      </span>
    );
  }

  const activeItems = useMemo(
    () => items.filter((c) => c.status === "active" || c.status === "manual"),
    [items]
  );

  const pendingItems = useMemo(
    () => items.filter((c) => c.status === "needs_auth" || c.status === "error"),
    [items]
  );

  const stalePendingItems = useMemo(() => {
    return pendingItems.filter((c) => {
      const hasActiveSameProvider = activeItems.some(
        (a) => a.provider === c.provider && a.status === "active"
      );

      return hasActiveSameProvider && isOlderThanHours(c.updated_at || c.created_at, 24);
    });
  }, [pendingItems, activeItems]);

  const recentPendingItems = useMemo(() => {
    const staleIds = new Set(stalePendingItems.map((c) => c.id));
    return pendingItems.filter((c) => !staleIds.has(c.id));
  }, [pendingItems, stalePendingItems]);

  const visibleRecentPending = showAllRecentPending
    ? recentPendingItems
    : recentPendingItems.slice(0, 3);

  const hiddenRecentPendingCount = Math.max(
    0,
    recentPendingItems.length - visibleRecentPending.length
  );

  const visibleOlderPending = showOlderPending ? stalePendingItems : [];
  const hiddenOlderPendingCount = Math.max(
    0,
    stalePendingItems.length - visibleOlderPending.length
  );

  const canShowConnect = (c: Connection) =>
    (c.provider === "basiq" || c.provider === "plaid") && c.status === "needs_auth";

  return (
    <Page
      title="Connections"
      subtitle="Where your accounts come from."
      right={<Chip onClick={() => router.push("/money")}>Back to Money</Chip>}
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="text-sm font-medium text-zinc-900">Data sources</div>
                <div className="text-xs text-zinc-500">
                  Add manual sources, or connect a bank.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void createManual()}
                  disabled={creatingManual || creatingBasiq || creatingPlaid}
                  variant="ghost"
                  className="rounded-2xl"
                >
                  {creatingManual ? "Adding…" : "Add manual"}
                </Button>

                <Button
                  onClick={() => void createBasiqAndConnect()}
                  disabled={creatingBasiq || creatingManual || creatingPlaid}
                  className="rounded-2xl"
                >
                  {creatingBasiq ? "Starting…" : "Add Basiq (AU)"}
                </Button>

                <Button
                  onClick={() => void createPlaidAndConnect()}
                  disabled={creatingPlaid || creatingManual || creatingBasiq}
                  className="rounded-2xl"
                >
                  {creatingPlaid ? "Starting…" : "Add Plaid (US)"}
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {loading ? (
                <div className="text-sm text-zinc-600">Loading…</div>
              ) : (
                <>
                  {activeItems.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Connected
                      </div>

                      {activeItems.map((c) => {
                        const title = displayTitle(c);
                        return (
                          <div
                            key={c.id}
                            className="rounded-3xl border border-emerald-200 bg-emerald-50/40 px-4 py-4 sm:px-5"
                          >
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="flex min-w-[240px] flex-1 items-start gap-3">
                                <div
                                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${institutionIconClass(
                                    c.provider
                                  )}`}
                                  aria-hidden="true"
                                >
                                  {institutionMonogram(title)}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-semibold text-zinc-900">
                                      {title}
                                    </div>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] ${providerChipClass(
                                        c.provider
                                      )}`}
                                    >
                                      {providerLabel(c.provider)}
                                    </span>
                                  </div>

                                  <div className="mt-1 text-sm text-zinc-600">
                                    {connectionSubline(c)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {c.status === "active" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => syncConnection(c.id)}
                                    disabled={syncingId === c.id}
                                  >
                                    {syncingId === c.id ? "Syncing…" : "Sync"}
                                  </Button>
                                )}

                                {statusChip(c.status)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {visibleRecentPending.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Needs attention
                        </div>

                        {recentPendingItems.length > 3 ? (
                          <button
                            type="button"
                            onClick={() => setShowAllRecentPending((v) => !v)}
                            className="text-xs text-zinc-500 hover:text-zinc-700"
                          >
                            {showAllRecentPending
                              ? "Show fewer"
                              : `Show ${hiddenRecentPendingCount} more`}
                          </button>
                        ) : null}
                      </div>

                      {visibleRecentPending.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-[240px] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-zinc-900">
                                  {displayTitle(c)}
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] ${providerChipClass(
                                    c.provider
                                  )}`}
                                >
                                  {providerLabel(c.provider)}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-zinc-500">
                                {[
                                  syncLine(c),
                                  c.created_at ? `Added ${softDate(c.created_at)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {canShowConnect(c) && c.provider === "basiq" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void startBasiqAuth(c.id)}
                                  disabled={connectingId === c.id}
                                >
                                  {connectingId === c.id ? "Opening…" : "Connect"}
                                </Button>
                              )}

                              {canShowConnect(c) && c.provider === "plaid" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void startPlaidAuth(c.id)}
                                  disabled={connectingId === c.id}
                                >
                                  {connectingId === c.id ? "Opening…" : "Connect"}
                                </Button>
                              )}

                              {statusChip(c.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {stalePendingItems.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Older unfinished connections
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowOlderPending((v) => !v)}
                          className="text-xs text-zinc-500 hover:text-zinc-700"
                        >
                          {showOlderPending
                            ? "Hide older unfinished"
                            : `Show ${hiddenOlderPendingCount} older`}
                        </button>
                      </div>

                      {visibleOlderPending.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-[240px] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-zinc-900">
                                  {displayTitle(c)}
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] ${providerChipClass(
                                    c.provider
                                  )}`}
                                >
                                  {providerLabel(c.provider)}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-zinc-500">
                                {[
                                  syncLine(c),
                                  c.created_at ? `Added ${softDate(c.created_at)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {canShowConnect(c) && c.provider === "basiq" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void startBasiqAuth(c.id)}
                                  disabled={connectingId === c.id}
                                >
                                  {connectingId === c.id ? "Opening…" : "Connect"}
                                </Button>
                              )}

                              {canShowConnect(c) && c.provider === "plaid" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void startPlaidAuth(c.id)}
                                  disabled={connectingId === c.id}
                                >
                                  {connectingId === c.id ? "Opening…" : "Connect"}
                                </Button>
                              )}

                              {statusChip(c.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!loading && activeItems.length === 0 && pendingItems.length === 0 ? (
                    <div className="text-sm text-zinc-600">No connections yet.</div>
                  ) : null}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}