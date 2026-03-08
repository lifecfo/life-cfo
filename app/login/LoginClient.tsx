"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Mode = "signin" | "signup" | "reset";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const err =
      searchParams?.get("err") ||
      searchParams?.get("error") ||
      searchParams?.get("error_description");

    if (err) setStatus(decodeURIComponent(err));
  }, [searchParams]);

  const passwordsMatch = useMemo(() => {
    if (mode !== "signup") return true;
    if (!confirmPassword) return false;
    return password === confirmPassword;
  }, [mode, password, confirmPassword]);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    if (!e.includes("@")) return false;
    if (working) return false;
    if (mode === "reset") return true;

    if (password.length < 6) return false;

    if (mode === "signup") return password === confirmPassword;

    return true;
  }, [email, password, confirmPassword, mode, working]);

  const goNext = () => {
    router.replace(nextPath || "/home");
    router.refresh();
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setWorking(true);
    setStatus("Signing in…");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setStatus(`Login failed: ${error.message}`);
        return;
      }

      setStatus(`Signed in ✅ ${data.user?.email ?? ""}`);
      goNext();
    } finally {
      setWorking(false);
    }
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setWorking(true);
    setStatus("Creating account…");

    try {
      const origin = window.location.origin;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) {
        setStatus(`Sign up failed: ${error.message}`);
        return;
      }

      if (!data.session) {
        setStatus(
          "Account created ✅ Check your email to confirm, then come back and sign in."
        );
        setMode("signin");
        setShowPassword(false);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      setStatus("Account created ✅ You’re signed in.");
      goNext();
    } finally {
      setWorking(false);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setStatus("Enter your email first, then click reset.");
      return;
    }

    setWorking(true);
    setStatus("Sending reset email…");

    try {
      const redirectTo = `${window.location.origin}/auth/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        setStatus(`Reset failed: ${error.message}`);
        return;
      }

      setStatus("Reset email sent ✅ Check your inbox.");
    } finally {
      setWorking(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    if (mode === "signin") return void signIn(e);
    if (mode === "signup") return void signUp(e);
    e.preventDefault();
    void sendReset();
  };

  const primaryLabel =
    mode === "signin"
      ? working
        ? "Signing in…"
        : "Sign in"
      : mode === "signup"
      ? working
        ? "Creating…"
        : "Create account"
      : working
      ? "Sending…"
      : "Send reset email";

  const subtitle =
    mode === "signin"
      ? "Sign in to continue."
      : mode === "signup"
      ? "Create an account to get started."
      : "We’ll email you a reset link.";

  return (
    <main className="min-h-screen bg-neutral-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Image
              src="/brand/lifecfo-logo-stacked.svg"
              alt="Life CFO"
              width={180}
              height={180}
              priority
              className="h-auto w-[150px] sm:w-[180px]"
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-text">
              {mode === "signin"
                ? "Welcome to Life CFO"
                : mode === "signup"
                ? "Create your account"
                : "Reset your password"}
            </h1>

            <p className="text-sm text-neutral-text-2 leading-relaxed">
              {mode === "reset"
                ? subtitle
                : "Life CFO is a calm money and decision system for families. Ask clear questions, hold important decisions safely, and move forward with less mental load."}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-border bg-neutral-surface shadow-sm p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-text">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="mt-1 w-full rounded-xl border border-neutral-border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-cfo/10 focus:border-cfo"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            {mode !== "reset" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-text">
                    Password
                  </label>

                  <div className="mt-1 relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      className="w-full rounded-xl border border-neutral-border bg-white px-3 py-2 pr-14 outline-none focus:ring-2 focus:ring-cfo/10 focus:border-cfo"
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-neutral-border bg-white px-2 py-1 text-xs text-neutral-text-2 hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-cfo/10"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>

                  <div className="mt-1 text-xs text-neutral-muted">
                    Minimum 6 characters.
                  </div>
                </div>

                {mode === "signup" ? (
                  <div>
                    <label className="block text-sm font-medium text-neutral-text">
                      Confirm password
                    </label>
                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      className="mt-1 w-full rounded-xl border border-neutral-border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-cfo/10 focus:border-cfo"
                      autoComplete="new-password"
                    />

                    {confirmPassword.length > 0 && !passwordsMatch ? (
                      <div className="mt-1 text-xs text-neutral-muted">
                        Passwords don’t match yet.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="pt-1 space-y-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  "w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cfo/10",
                  !canSubmit
                    ? "bg-btn-primaryDisabled text-btn-primaryText cursor-not-allowed"
                    : "bg-btn-primary text-btn-primaryText hover:bg-btn-primaryHover",
                ].join(" ")}
              >
                {primaryLabel}
              </button>

              <div className="flex items-center justify-between gap-3">
                {mode === "signin" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setStatus("");
                      setShowPassword(false);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    className="inline-flex items-center rounded-full border border-neutral-border bg-white px-3 py-1 text-sm text-neutral-text hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-cfo/10"
                  >
                    Create account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setStatus("");
                      setShowPassword(false);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    className="inline-flex items-center rounded-full border border-neutral-border bg-white px-3 py-1 text-sm text-neutral-text hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-cfo/10"
                  >
                    Back to sign in
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (mode === "reset") {
                      setMode("signin");
                      setStatus("");
                      setPassword("");
                      setConfirmPassword("");
                      return;
                    }
                    setMode("reset");
                    setStatus("");
                    setShowPassword(false);
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="inline-flex items-center rounded-full border border-neutral-border bg-white px-3 py-1 text-sm text-neutral-text hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-cfo/10"
                >
                  {mode === "reset" ? "Back" : "Forgot password"}
                </button>
              </div>

              {mode === "reset" ? (
                <div className="text-xs text-neutral-muted">Uses the email above</div>
              ) : null}
            </div>

            {status && (
              <div className="rounded-xl bg-cfo-soft border border-neutral-border p-3 text-sm text-neutral-text">
                {safeStr(status)}
              </div>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-neutral-muted">
          One place. One question. One answer.
        </p>
      </div>
    </main>
  );
}