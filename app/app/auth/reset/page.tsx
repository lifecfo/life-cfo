"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<string>("Reading reset token...");
  const [ready, setReady] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    const run = async () => {
      // Supabase recovery links arrive in the hash (#access_token=...&refresh_token=...&type=recovery)
      const hash = window.location.hash || "";
      if (!hash) {
        setStatus("No reset token found in URL. Please click the reset email link again.");
        return;
      }

      const params = new URLSearchParams(hash.replace("#", ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const type = params.get("type");

      if (!access_token || !refresh_token) {
        setStatus("Reset token missing or expired. Please request a new reset email.");
        return;
      }

      if (type !== "recovery") {
        // Not fatal, but helps debugging
        console.log("Auth type:", type);
      }

      setStatus("Setting session...");
      const { error: setErr } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (setErr) {
        setStatus(`Could not set session: ${setErr.message}`);
        return;
      }

      setReady(true);
      setStatus("Session set ✅ Enter a new password.");
    };

    run();
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

    setStatus("Password updated ✅ You can close this tab.");
    // Optional: sign out to force a clean next login
    // await supabase.auth.signOut();
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Reset password</h1>
      <p>{status}</p>

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
