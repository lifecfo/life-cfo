"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Keystone</h1>

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        Home page is working ✅
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <Link
          href="/home"
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <strong>Home</strong>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Your visible items + decide now + snooze + done
          </div>
        </Link>

        <Link
          href="/decisions"
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <strong>Decisions</strong>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Review past decisions + reasoning + AI analysis
          </div>
        </Link>

        <Link
          href="/engine"
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <strong>Engine (manual)</strong>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Generate realistic home items (dev tool)
          </div>
        </Link>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        Tip: Engine → Home → Decide Now → Decisions
      </div>
    </main>
  );
}
