"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, CardContent, useToast } from "@/components/ui";
import { friendlyAuthLinkError } from "@/lib/auth/authLinkError";

type Stage = "checking" | "ready" | "error";

function LifeCFOBrand() {
  return (
    <div className="flex justify-center">
      <Image
        src="/brand/lifecfo-logo-stacked-white-transparent.svg"
        alt="Life CFO"
        width={180}
        height={180}
        priority
        className="h-auto w-[150px] sm:w-[180px]"
      />
    </div>
  );
}

export default function ResetPasswordPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();

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
    let settled = false;

    const linkErr = searchParams?.get("err");
    if (linkErr) {
      setStage("error");
      setMessage(decodeURIComponent(linkErr));
      return;
    }

    setStage("checking");
    setMessage("Checking reset session…");
    setSignedInEmail(null);

    const applySession = (session: { user?: { email?: string | null } } | null) => {
      if (!mounted || settled) return;
      if (!session) return; // not settled yet -- keep waiting for a later event or the timeout
      settled = true;
      setSignedInEmail(session.user?.email ?? null);
      setStage("ready");
      setMessage("");
    };

    // The server-side code exchange (app/auth/reset/route.ts) sets the
    // session cookie, but this freshly-mounted browser client still has to
    // finish reading it from storage -- a one-shot getSession() call right
    // on mount can race that and report "no session" even though one is
    // about to appear. onAuthStateChange's INITIAL_SESSION event is the
    // documented signal that the client has actually finished checking.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    // Still attempt an immediate check -- harmless if INITIAL_SESSION beats
    // it, and covers any client version where that event doesn't fire.
    void supabase.auth
      .getSession()
      .then(({ data }) => applySession(data?.session ?? null))
      .catch(() => {});

    const timeout = window.setTimeout(() => {
      if (!mounted || settled) return;
      settled = true;
      setStage("error");
      setMessage("No active reset session found. Please request a new reset email.");
    }, 5000);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [searchParams]);

  const onSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setStage("error");
        setMessage(friendlyAuthLinkError(error.message));
        return;
      }

      showToast({ message: "Password updated ✅ Redirecting you to Home…" }, 6000);
      window.location.href = "/home";
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-cfo flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-5">
        <LifeCFOBrand />

        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Reset password
          </h1>

          {stage === "ready" && (
            <div className="text-sm text-white/85">
              {signedInEmail ? (
                <span>
                  Signed in as <strong>{signedInEmail}</strong>
                </span>
              ) : (
                <span>Signed in</span>
              )}
            </div>
          )}

          {stage === "checking" && (
            <div className="text-sm text-white/85">Checking reset session…</div>
          )}

          {stage === "error" && message && (
            <div className="text-sm text-white/90">{message}</div>
          )}
        </div>

        <Card className="border border-white/20 bg-neutral-surface shadow-sm">
          <CardContent>
            {stage !== "ready" ? (
              <div className="space-y-3">
                <div className="text-sm text-neutral-text-2">
                  {message || "Checking reset session…"}
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/login">
                    <Button>Request a new reset email</Button>
                  </Link>

                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                    title="Re-check session"
                  >
                    Refresh
                  </Button>
                </div>

                {stage === "error" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Tip: open the newest reset email link in the same browser/device where you requested it. If anything looks
                    off, request a fresh reset email.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-neutral-text">New password</div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cfo/10 focus:border-cfo"
                      autoComplete="new-password"
                    />
                    {newPassword && newPassword.length < 8 && (
                      <div className="text-xs text-neutral-muted">Use at least 8 characters.</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium text-neutral-text">Confirm new password</div>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-type your new password"
                      className="w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cfo/10 focus:border-cfo"
                      autoComplete="new-password"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSubmit();
                      }}
                    />
                    {confirm && newPassword !== confirm && (
                      <div className="text-xs text-alert-errorText">Passwords don’t match.</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={onSubmit} disabled={!canSubmit || saving}>
                    {saving ? "Setting…" : "Set new password"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-white/70">
          Having trouble?{" "}
          <Link className="underline" href="/login">
            Request a new reset link
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
