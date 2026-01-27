// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FinePrintClientProps = {
  nextPath: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintClient({ nextPath }: FinePrintClientProps) {
  const router = useRouter();
  const toastApi: any = useToast();

  // Keystone UI toast convention in this repo: showToast({ message })
  const toast = (message: string) => {
    if (toastApi?.showToast) {
      toastApi.showToast({ message });
      return;
    }
    // fallback if showToast not present
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

      // IMPORTANT:
      // - Your profiles table does NOT include updated_at (per your column screenshot)
      // - It DOES include user_id (and likely requires it)
      const payload = {
        user_id: auth.user.id,
        fine_print_accepted_at: new Date().toISOString(),
        fine_print_version: VERSION,
        fine_print_signed_name: name.trim(),
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      toast("Saved.");
      router.replace(nextPath || "/home");
      router.refresh();
    } catch (e: any) {
      const msg = safeStr(e?.message) || "Couldn’t save. Please try again.";
      setStatus(msg);
      toast(`Couldn’t save — ${msg}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">What Keystone is</div>
            <div className="text-sm text-zinc-700">
              Keystone is a calm place to hold decisions and inputs so you can see life more clearly and stop carrying mental loops.
            </div>
            <div className="text-sm text-zinc-700">It’s built for orientation and repeatable good decisions — not dashboards, not hustle.</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">What Keystone is not</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>Not financial, legal, medical, or tax advice.</li>
              <li>Not a forecast or guarantee.</li>
              <li>Not accounting software.</li>
              <li>Not a replacement for professional help when you need it.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">AI boundaries</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>AI helps when you ask.</li>
              <li>No auto-decisions. No auto-saving.</li>
              <li>Summaries are preview-first, then explicitly attached by you.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

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
