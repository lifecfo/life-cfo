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

  const VERSION = "v1";

  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);

  const canSave = useMemo(() => name.trim().length >= 2 && !working, [name, working]);

  const save = async () => {
    if (!canSave) {
      showToast({ title: "Add your name", description: "Please type your name to continue." });
      return;
    }

    setWorking(true);

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user) {
        router.push("/login");
        return;
      }

      const uid = auth.user.id;

      const payload = {
        // canonical profile key
        id: uid,

        // keep user_id populated too (optional, but harmless + useful for older queries)
        user_id: uid,

        fine_print_accepted_at: new Date().toISOString(),
        fine_print_version: VERSION,
        fine_print_signed_name: name.trim(),
        updated_at: new Date().toISOString(),
      };

      // Upsert by id (canonical)
      const { error } = await supabase.from("profiles").upsert(payload as any, { onConflict: "id" });
      if (error) throw error;

      showToast({ title: "Saved", description: "Thank you. You’re all set." });

      router.push(nextPath || "/home");
      router.refresh();
    } catch (e: any) {
      showToast({ title: "Couldn’t save", description: safeStr(e?.message) || "Something went wrong." });
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

            <div className="text-xs text-zinc-500">Version: {VERSION}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
