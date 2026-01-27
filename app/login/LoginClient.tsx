"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [showPassword, setShowPassword] = useState(false);

  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string>("");

  // Surface auth errors passed back via redirect
  useEffect(() => {
    const err =
      searchParams?.get("err") ||
      searchParams?.get("error") ||
      searchParams?.get("error_description");

    if (err) setStatus(decodeURIComponent(err));
  }, [searchParams]);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    if (!e.includes("@")) return false;
    if (working) return false;
    if (mode === "reset") return true;
    return password.length >= 6;
  }, [email, password, mode, working]);

  const goNext = () => {
    router.replace(nextPath || "/home");
    router.refresh();
  };

  const signIn = async (e: React.FormEvent) => {
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

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setWorking(true);
    setStatus("Creating account…");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setStatus(`Sign up failed: ${error.message}`);
        return;
      }

      // If email confirmations are enabled, session can be null until confirmed.
      if (!data.session) {
        setStatus("Account created ✅ Check your email to confirm, then come back and sign in.");
        setMode("signin");
        setShowPassword(false);
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (error) {
        setStatus(`Reset failed: ${error.message}`);
        return;
      }

      setStatus("Reset email sent ✅ Check your inbox.");
    } finally {
      setWorking(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
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
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header / Mini landing */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-2xl bg-black flex items-center justify-center text-white font-semibold text-lg">
            K
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome to Keystone" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>

          <p className="text-sm text-neutral-600 leading-relaxed">
            {mode === "reset"
              ? subtitle
              : "Keystone is a values-first decision and money operating system. Capture what matters, make clear decisions, and review them over time — without noise or guilt."}
          </p>

          {/* tiny tester hint */}
          {mode !== "reset" ? (
            <p className="text-xs text-neutral-500">
              Tip: after signing in, open <span className="font-medium">Menu → Demo</span> to load sample data.
            </p>
          ) : null}
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            {mode !== "reset" ? (
              <div>
                <label className="block text-sm font-medium text-neutral-800">Password</label>

                <div className="mt-1 relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 pr-14 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-black/10"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="mt-1 text-xs text-neutral-500">Minimum 6 characters.</div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="pt-1 space-y-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  "w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-black/10",
                  !canSubmit ? "bg-black/40 text-white cursor-not-allowed" : "bg-black text-white hover:bg-black/90",
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
                    }}
                    className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-black/10"
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
                    }}
                    className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-black/10"
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
                      return;
                    }
                    setMode("reset");
                    setStatus("");
                    setShowPassword(false);
                  }}
                  className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-50 transition focus:outline-none focus:ring-2 focus:ring-black/10"
                >
                  {mode === "reset" ? "Back" : "Forgot password"}
                </button>
              </div>

              {mode === "reset" ? <div className="text-xs text-neutral-500">Uses the email above</div> : null}
            </div>

            {status && (
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-sm text-neutral-800">
                {safeStr(status)}
              </div>
            )}
          </form>
        </div>

        {/* Footer values line */}
        <p className="text-center text-xs text-neutral-500">Designed for clarity • Built for long-term thinking</p>
      </div>
    </main>
  );
}
