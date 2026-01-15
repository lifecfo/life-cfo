"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState("Checking reset session...");
  const [ready, setReady] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        setStatus(
          "No active reset session found. Please click the newest reset link in your email."
        );
        setReady(false);
        return;
      }

      setStatus("Ready ✅ Enter a new password.");
      setReady(true);
    };

    checkSession();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pw.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (pw !== pw2) {
      setStatus("Passwords do not match.");
      return;
    }

    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({ password: pw });

    if (error) {
      setStatus(`Password update failed: ${error.message}`);
      return;
    }

    setStatus("Password updated ✅ Redirecting to Inbox...");

    setTimeout(() => {
      router.replace("/inbox");
      router.refresh();
    }, 800);
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Reset password</h1>
      <p>{status}</p>

      {!ready && (
        <button
          type="button"
          onClick={() => router.replace("/login")}
          style={{ marginTop: 16, padding: 10 }}
        >
          Go to login to request a new reset email
        </button>
      )}

      {ready && (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label>
            New password
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              autoFocus
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <button type="submit" style={{ padding: 10 }}>
            Set new password
          </button>
        </form>
      )}
    </main>
  );
}
