// app/reset/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, CardContent, useToast } from "@/components/ui";

type Stage = "checking" | "ready" | "error";

function isPkceError(msg: string) {
  const m = (msg || "").toLowerCase();
  return m.includes("pkce") || m.includes("code verifier");
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [stage, setStage] = useState<Stage>("checking");
  const [message, setMessage] = useState<string>("Checking reset session…");

  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

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
        // Coming from email link: /auth/reset exchanges the code into a cookie session, then redirects here.
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          setStage("error");
          setMessage(
            isPkceError(error.message)
              ? "Reset link invalid/expired. Please request a new reset email."
              : error.message
          );
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
        setMessage("");
      } catch (e: any) {
        if (!mounted) return;
        setStage("error");
        setMessage(e?.message ?? "Something went wrong. Please request a new reset email.");
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
            ? "Reset link invalid/expired. Please request a new reset email."
            : error.message
        );
        return;
      }

      showToast({ message: "Password updated ✅" }, 5000);

      // Keep it simple: return them to the app.
      router.replace("/inbox");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      {/* Brand (top, immediate reassurance) */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-between">
        <Link href="/inbox" className="flex items-center gap-3 no-underline">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
            K
          </div>
          <div className="text-base font-semibold text-zinc-900">Keystone</div>
        </Link>

        <Link href="/inbox">
          <Button variant="secondary">Back to the app</Button>
        </Link>
      </div>

      <div className="mx-auto mt-8 w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Reset password</h1>

        {stage === "checking" && (
          <div className="mt-2 text-sm text-zinc-600">Checking reset session…</div>
        )}

        {stage === "error" && (
          <div className="mt-2 text-sm text-zinc-700">{message}</div>
        )}

        {stage === "ready" && signedInEmail && (
          <div className="mt-2 text-sm text-zinc-600">
            Signed in as <strong className="text-zinc-900">{signedInEmail}</strong>
          </div>
        )}

        <Card className="mt-6">
          <CardContent>
            {stage !== "ready" ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-700">{message}</div>

                <div className="flex flex-wrap gap-2">
                  <Link href="/login">
                    <Button>Go to Login</Button>
                  </Link>

                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                    title="Re-check session"
                  >
                    Refresh
                  </Button>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  If you opened the email link on a different device/browser, or cleared cookies/storage, request a new
                  reset email from Login.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-zinc-900">New password</div>
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
                    <div className="text-sm font-medium text-zinc-900">Confirm new password</div>
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

                  <Link href="/inbox">
                    <Button variant="secondary">Back to the app</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Having trouble? Request a new reset link from{" "}
          <Link className="underline" href="/login">
            Login
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
