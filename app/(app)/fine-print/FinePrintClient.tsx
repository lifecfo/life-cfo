// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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

function safeNext(input: unknown) {
  if (typeof input !== "string") return "/home";
  const n = input.trim();
  if (!n.startsWith("/")) return "/home";
  if (n.startsWith("//")) return "/home";
  if (n.includes("http://") || n.includes("https://")) return "/home";
  return n;
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

  const VERSION = "v1";

  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string>("");

  const canSave = useMemo(() => name.trim().length >= 2 && !working, [name, working]);

  const save = async () => {
    setStatus("");

    if (!canSave) {
      const msg = "Please type your name to continue.";
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

      const payload = {
        user_id: auth.user.id,
        fine_print_accepted_at: new Date().toISOString(),
        fine_print_version: VERSION,
        fine_print_signed_name: name.trim(),
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      toast("Saved.");

      // ✅ Hard navigate so it always moves on the first click (no router edge cases)
      let dest = safeNext(nextPath || "/home");

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
            <div className="text-sm font-semibold text-zinc-900">Signature</div>
            <div className="text-sm text-zinc-700">Type your name once to confirm you understand these boundaries.</div>

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

            <div className="text-xs text-zinc-500">Version: {VERSION}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
