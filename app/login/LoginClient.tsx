"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  // Surface auth errors passed back via redirect
  useEffect(() => {
    const err =
      searchParams?.get("err") ||
      searchParams?.get("error") ||
      searchParams?.get("error_description");

    if (err) setStatus(decodeURIComponent(err));
  }, [searchParams]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Signing in…");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(`Login failed: ${error.message}`);
      return;
    }

    setStatus(`Signed in ✅ ${data.user?.email ?? ""}`);

    router.replace(nextPath || "/home");
    router.refresh();
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setStatus("Enter your email first, then click reset.");
      return;
    }

    setStatus("Sending reset email…");

    const redirectTo = `${window.location.origin}/auth/reset`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setStatus(`Reset failed: ${error.message}`);
      return;
    }

    setStatus("Reset email sent ✅ Check your inbox.");
  };

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header / Mini landing */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-2xl bg-black flex items-center justify-center text-white font-semibold text-lg">
            K
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Keystone
          </h1>

          <p className="text-sm text-neutral-600 leading-relaxed">
            Keystone is a values-first decision and money operating system.
            Capture what matters, make clear decisions, and review them over
            time — without noise or guilt.
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-black text-white py-2.5 font-medium hover:bg-black/90 transition"
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={sendReset}
              className="w-full rounded-xl border border-neutral-300 bg-white py-2.5 font-medium text-neutral-900 hover:bg-neutral-50 transition"
            >
              Forgot password
            </button>

            {status && (
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-sm text-neutral-800">
                {status}
              </div>
            )}
          </form>
        </div>

        {/* Footer values line */}
        <p className="text-center text-xs text-neutral-500">
          Designed for clarity • Built for long-term thinking
        </p>
      </div>
    </main>
  );
}
