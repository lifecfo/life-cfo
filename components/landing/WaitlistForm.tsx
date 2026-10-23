"use client";

import { useState, type FormEvent } from "react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const company = String(new FormData(event.currentTarget).get("company") || "");
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage(json?.message || json?.error || "The list could not be saved.");
      if (response.ok) setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-2">
        <label className="sr-only" htmlFor="waitlist-email">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@email.com"
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/60 focus:border-white/40"
          autoComplete="email"
        />
        <input className="hidden" tabIndex={-1} autoComplete="off" name="company" aria-hidden="true" />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Join the list
        </button>
      </div>
      {message ? <p className="text-xs text-white/80">{message}</p> : null}
      <p className="text-xs leading-5 text-white/70">
        We’ll email you when a place is open. Joining does not create an account.
      </p>
    </form>
  );
}
