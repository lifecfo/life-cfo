"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

type Connection = {
  id: string;
  provider: string;
  status: string;
  display_name: string | null;
  last_sync_at: string | null;
  created_at: string | null;
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
    onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void | Promise<void>;
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

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/money/connections", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Load failed");
      setItems(json.connections ?? []);
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

  function syncLine(c: Connection) {
    if (c.last_sync_at) return `Synced ${softDate(c.last_sync_at)}`;
    if (c.status === "manual") return "Manual entry";
    if (c.status === "needs_auth") return "Awaiting connection";
    if (c.status === "error") return "Needs review";
    return "";
  }

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
                <div className="text-sm font-medium text-zinc-900">
                  Data sources
                </div>
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
              ) : items.length === 0 ? (
                <div className="text-sm text-zinc-600">No connections yet.</div>
              ) : (
                items.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-[240px] flex-1">
                        <div className="text-sm font-medium text-zinc-900">
                          {c.display_name || c.provider}
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
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}