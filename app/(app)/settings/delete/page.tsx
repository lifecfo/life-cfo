// app/(app)/settings/delete/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DeleteAccountPage() {
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

  const [working, setWorking] = useState(false);
  const [typed, setTyped] = useState("");

  const canDelete = useMemo(() => typed.trim().toLowerCase() === "delete", [typed]);

  const doDelete = async () => {
    if (working) return;

    if (!canDelete) {
      showToast({ title: "Type DELETE", description: "Please type DELETE to confirm." });
      return;
    }

    setWorking(true);

    try {
      // Single best-practice call:
      // - server reads auth cookies
      // - deletes app data (RPC)
      // - deletes auth user (service role)
      const res = await fetch("/api/delete-account", { method: "POST" });

      if (!res.ok) {
       const text = await res.text().catch(() => "");
let msg = "Account deletion failed.";
try {
  const j = JSON.parse(text || "{}");
  msg = j?.error || j?.message || msg;
} catch {
  if (text) msg = text;
}
throw new Error(msg);
      }

      // Clear local session and go to login
      await supabase.auth.signOut();
      showToast({ title: "Deleted", description: "Your account has been deleted." });

      router.push("/login");
      router.refresh();
    } catch (e: any) {
      showToast({ title: "Couldn’t delete", description: e?.message ?? "Something went wrong." });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page
      title="Delete account"
      subtitle="This permanently deletes your Keystone data and your login."
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
              <div className="text-sm font-semibold text-zinc-900">This is permanent</div>

              <div className="text-sm text-zinc-700">
                We’ll delete your decisions, notes, attachments metadata, and money inputs tied to your user id.
              </div>

              <div className="text-xs text-zinc-500">
                Type <span className="font-semibold text-zinc-900">DELETE</span> to confirm.
              </div>

              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type DELETE"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={() => void doDelete()} disabled={working || !canDelete}>
                  {working ? "Deleting…" : "Delete my account"}
                </Button>
                <Chip onClick={() => router.push("/settings")}>Cancel</Chip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
