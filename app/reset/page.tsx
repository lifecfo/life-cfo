"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, CardContent, useToast } from "@/components/ui";
import { Page } from "@/components/Page";

type Stage = "checking" | "ready" | "error";

function isPkceError(msg: string) {
  const m = (msg || "").toLowerCase();
  return m.includes("pkce") || m.includes("code verifier");
}

export default function ResetPasswordPage() {
  const { showToast } = useToast();

  const [stage, setStage] = useState<Stage>("checking");
  const [message, setMessage] = useState<string>("Checking reset session…");

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (stage !== "ready") return false;
    if (!newPassword || !confirm) return false;
    if (newPassword.length < 8) return false;
    if (newPassword !== confirm) return false;
    return true;
  }, [stage, newPassword, confirm]);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      setStage("checking");
      setMessage("Checking reset session…");
      setSignedInEmail(null);

      try {
        // /auth/reset exchanges the code and redirects here.
        // If cookies/session are present, session should exist now.
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          setStage("error");
          setMessage(error.message);
          return;
        }

        const session = data?.session;
        if (!session) {
          setStage("error");
          setMessage("No active reset session found. Please request a new reset email.");
          return;
        }

        setSignedInEmail(session.user?.email ?? null);
        setStage("ready");
        setMessage("Set a new password below.");
      } catch (e: any) {
        if (!mounted) return;
        setStage("error");
        setMessage(e?.message ?? "Something went wrong checking the reset session.");
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setStage("error");
        setMessage(
          isPkceError(error.message)
            ? "This reset link is invalid/expired (PKCE verifier missing). Please request a new reset email and open it in the same browser."
            : error.message
        );
        return;
      }

      showToast({ message: "Password updated ✅ Redirecting you to Inbox…" }, 6000);

      // After password update, send them back into the app.
      window.location.href = "/inbox";
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = () => {
    if (stage === "checking") return <Badge variant="warning">Checking…</Badge>;
    if (stage === "ready") return <Badge variant="success">Ready</Badge>;
    return <Badge variant="danger">Action needed</Badge>;
  };

  return (
    <Page
      title="Reset password"
      subtitle={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {statusBadge()}
            <div className="text-zinc-700">{message}</div>
          </div>

          {stage === "ready" && (
            <div className="text-sm text-zinc-600">
              {signedInEmail ? (
                <span>
                  Signed in as <strong>{signedInEmail}</strong>.
                </span>
              ) : (
                <span>Signed in.</span>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-3">
        <Card>
          <CardContent>
            {stage !== "ready" ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-700">{message}</div>

                <div className="flex flex-wrap gap-2">
                  <Link href="/login">
                    <Button>Request a new reset email</Button>
                  </Link>

                  <Button variant="secondary" onClick={() => window.location.reload()} title="Re-check session">
                    Refresh
                  </Button>
                </div>

                {stage === "error" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Tip: open the newest reset email link in the same browser/device where you requested it.
                    If anything looks off, request a fresh reset email.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">New password</div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      autoComplete="new-password"
                    />
                    {newPassword && newPassword.length < 8 && (
                      <div className="text-xs text-zinc-500">Use at least 8 characters.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium">Confirm new password</div>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-type your new password"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      autoComplete="new-password"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSubmit();
                      }}
                    />
                    {confirm && newPassword !== confirm && (
                      <div className="text-xs text-red-700">Passwords don’t match.</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onSubmit} disabled={!canSubmit || saving}>
                    {saving ? "Setting…" : "Set new password"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-zinc-500">
          Having trouble?{" "}
          <Link className="underline" href="/login">
            Request a new reset link
          </Link>
          .
        </div>
      </div>
    </Page>
  );
}
