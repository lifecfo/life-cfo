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
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <label className="block text-sm font-medium text-zinc-900" htmlFor="waitlist-email">
        Email
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        autoComplete="email"
      />
      <input className="hidden" tabIndex={-1} autoComplete="off" name="company" aria-hidden="true" />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Join the list
      </button>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      <p className="text-sm leading-6 text-zinc-600">
        Joining the list stores this email so we can tell you when a place is open. It does not create an account and it does not reserve a price.
      </p>
    </form>
  );
}
