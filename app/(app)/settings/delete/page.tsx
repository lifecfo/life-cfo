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
  self_service_allowed: false;
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
      subtitle="Account deletion is handled with support during private beta."
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
              <div className="text-sm font-semibold text-zinc-900">
                Account deletion is handled with support during private beta.
              </div>
              <div className="text-sm text-zinc-700">
                This helps us make sure shared household information and bank connections are handled safely.
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
              {loadError ? (
                <div className="text-sm text-zinc-600">
                  We couldn’t check every detail yet. Support can still help.
                </div>
              ) : null}
              <a
                className="inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href="mailto:admin@life-cfo.com?subject=Life%20CFO%20account%20deletion%20request"
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
