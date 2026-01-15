"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();

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

    router.replace(nextPath || "/inbox");
    router.refresh();
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setStatus("Type your email first, then click Reset.");
      return;
    }

    setStatus("Sending reset email...");

    // IMPORTANT:
    // Use current origin so dev uses localhost and prod uses Vercel automatically.
    // Use a dedicated reset callback route so we ALWAYS end up at /reset (no guessing).
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
