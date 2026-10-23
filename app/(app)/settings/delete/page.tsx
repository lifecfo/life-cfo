// app/(app)/settings/delete/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

type DeleteBlocker = {
  code: string;
  household_id: string;
  message: string;
  action_label: string;
  href: string;
};

type DeletePreflight = {
  ok: true;
  self_service_allowed: boolean;
  blockers: DeleteBlocker[];
  message: string;
};

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function DeleteAccountPage() {
  const router = useRouter();
  const [preflight, setPreflight] = useState<DeletePreflight | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/settings/delete/preflight", {
          cache: "no-store",
        });
        const json = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok || recordValue(json, "ok") !== true) {
          throw new Error(
            safeString(recordValue(json, "error")) || "Life CFO couldn’t check this yet."
          );
        }
        if (!cancelled) setPreflight(json as DeletePreflight);
      } catch (error: unknown) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Life CFO couldn’t check this yet."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page
      title="Delete account"
      subtitle="Download your data first if you want a copy. Deletion removes this account."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/settings")}>Back to Settings</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Delete this account</div>
              <div className="text-sm text-zinc-700">
                If you share a household and you are not the only owner, the household can stay for the other people. If you are the only person in a household, that household is deleted with the account.
              </div>
              {loading ? (
                <div className="text-sm text-zinc-500">Checking your households…</div>
              ) : null}
              {!loading && preflight?.blockers.length ? (
                <div className="space-y-2">
                  {preflight.blockers.map((blocker, index) => (
                    <div
                      key={`${blocker.code}-${blocker.household_id}-${index}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                    >
                      <div className="text-sm text-zinc-700">{blocker.message}</div>
                      <a
                        href={blocker.href}
                        className="mt-2 inline-flex text-sm font-medium text-zinc-800 underline underline-offset-4"
                      >
                        {blocker.action_label}
                      </a>
                    </div>
                  ))}
                </div>
              ) : null}
              {loadError ? <div className="text-sm text-zinc-600">{loadError}</div> : null}
              {!loading && preflight?.self_service_allowed ? (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-700">Type DELETE to confirm.</div>
                  <input
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm"
                  />
                  {deleteError ? <div className="text-sm text-zinc-600">{deleteError}</div> : null}
                  <button
                    type="button"
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    disabled={deleting || confirmText !== "DELETE"}
                    onClick={() => {
                      setDeleting(true);
                      setDeleteError("");
                      void fetch("/api/delete-account", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ confirm: "DELETE" }),
                      })
                        .then(async (response) => {
                          const json = (await response.json().catch(() => ({}))) as { error?: string };
                          if (!response.ok) throw new Error(json.error || "Couldn't delete the account.");
                          window.location.assign("/login");
                        })
                        .catch((error: unknown) => {
                          setDeleteError(error instanceof Error ? error.message : "Couldn't delete the account.");
                          setDeleting(false);
                        });
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete my account"}
                  </button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
