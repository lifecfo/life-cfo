// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeNextPath } from "@/lib/http/safeNextPath";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import type { MoneyDataCoverage, MoneySetupStatus } from "@/lib/money/reasoning/types";
import ImportantInformationContent from "./ImportantInformationContent";

export const dynamic = "force-dynamic";

type OverviewResponse = {
  setup_status?: MoneySetupStatus;
  data_coverage?: MoneyDataCoverage;
};

type FinePrintClientProps = {
  nextPath: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintClient({ nextPath }: FinePrintClientProps) {
  const router = useRouter();
  const toastApi = useToast();

  const toast = (message: string) => {
    if (toastApi?.showToast) {
      toastApi.showToast({ message });
      return;
    }
    if (toastApi?.toast) {
      toastApi.toast({ description: message });
    }
  };

  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [resident, setResident] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string>("");

  const canSave = useMemo(
    () => name.trim().length >= 2 && adult && resident && !working,
    [adult, name, resident, working]
  );

  const save = async () => {
    setStatus("");

    if (!canSave) {
      const msg = "Confirm you are 18 or older, live in Australia, and type your name.";
      setStatus(msg);
      toast(msg);
      return;
    }

    setWorking(true);

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();

      if (authErr || !auth?.user) {
        const msg = "Please sign in again.";
        setStatus(msg);
        toast(msg);
        router.push("/login");
        return;
      }

      const response = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signed_name: name.trim(),
          confirmed_adult: true,
          confirmed_au_resident: true,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Couldn't save. Please try again.");
      }

      toast("Saved.");

      let dest = safeNextPath(nextPath || "/home");

      // If no specific page was requested, send brand-new users to Start here
      // instead of Home — but fail open to /home if the check itself fails.
      if (dest === "/home") {
        try {
          const overviewRes = await fetch("/api/money/overview", { cache: "no-store" });
          const overview = (await overviewRes.json().catch(() => null)) as OverviewResponse | null;

          if (overviewRes.ok && overview) {
            const usableNow =
              overview.setup_status?.usable_now ??
              ((overview.data_coverage?.account_count ?? 0) > 0 ||
                (overview.data_coverage?.transaction_count ?? 0) > 0);

            if (!usableNow) {
              dest = "/money/setup";
            }
          }
        } catch {
          // Fail open: keep dest as "/home".
        }
      }

      window.location.assign(dest);
      return;
    } catch (error: unknown) {
      const msg = safeStr(error instanceof Error ? error.message : "") || "Couldn’t save. Please try again.";
      setStatus(msg);
      toast(`Couldn’t save — ${msg}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <ImportantInformationContent />

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Before you continue</div>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
              <span>I am 18 or older.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={resident}
                onChange={(e) => setResident(e.target.checked)}
                className="mt-1"
              />
              <span>I live in Australia.</span>
            </label>
            <div className="text-sm text-zinc-700">Type your name to confirm you have read this.</div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => void save()} disabled={!canSave}>
                {working ? "Saving…" : "Save and continue"}
              </Button>
              <Chip onClick={() => router.push("/login")} className="text-zinc-500">
                Cancel
              </Chip>
            </div>

            {status ? <div className="text-sm text-zinc-600">{status}</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
