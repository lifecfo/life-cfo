"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(`Login failed: ${error.message}`);
      return;
    }

    setStatus(`Signed in ✅ ${data.user?.email ?? ""}`);

    // ✅ Compute next at the moment we redirect (more reliable than top-level const)
    const next = searchParams.get("next") || "/inbox";

    // ✅ Ensure session is fully persisted before navigating (avoids redirect loops)
    await supabase.auth.getSession();

    // ✅ Navigate + refresh so server/proxy re-evaluates auth immediately
    router.replace(next);
    router.refresh();
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setStatus("Type your email first, then click Reset.");
      return;
    }

    setStatus("Sending reset email...");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

    if (error) {
      setStatus(`Reset failed: ${error.message}`);
      return;
    }

    setStatus("Reset email sent ✅ Check your inbox.");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Login</h1>

      <form onSubmit={signIn} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            placeholder="you@email.com"
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            autoComplete="current-password"
          />
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Sign in
        </button>

        <button type="button" onClick={sendReset} style={{ padding: 10 }}>
          Forgot password (send reset email)
        </button>
      </form>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </main>
  );
}
