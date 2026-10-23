"use client";

import Image from "next/image";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PRODUCT_NAME } from "@/lib/brand";
import { safeNextPath } from "@/lib/http/safeNextPath";

function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"), "/start");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/beta/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
      if (!response.ok || !json?.ok) {
        setMessage(json?.error || "That invite code was not recognised.");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-text" htmlFor="invite-code">
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-neutral-border bg-white px-3 py-2 outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
        />
      </div>
      <button
        type="submit"
        disabled={working || code.trim().length < 4}
        className={[
          "w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cfo/10",
          working || code.trim().length < 4
            ? "cursor-not-allowed bg-btn-primaryDisabled text-btn-primaryText"
            : "bg-btn-primary text-btn-primaryText hover:bg-btn-primaryHover",
        ].join(" ")}
      >
        {working ? "Checking…" : "Continue"}
      </button>
      {message ? <p className="text-sm text-neutral-text">{message}</p> : null}
    </form>
  );
}

export default function BetaInvitePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-brand-teal to-[#174544] px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[42%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/8 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="relative -mb-1 flex justify-center">
            <div className="absolute h-28 w-28 rounded-full bg-white/10 blur-3xl sm:h-36 sm:w-36" />
            <Image
              src="/brand/lifecfo-logo-stacked-white-transparent.svg"
              alt={PRODUCT_NAME}
              width={180}
              height={180}
              priority
              className="relative h-auto w-[190px] sm:w-[230px]"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Invite code</h1>
          <p className="text-sm leading-relaxed text-white/85">
            This beta is invite-only. Enter the code you were given.
          </p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-neutral-surface p-6 shadow-[0_30px_80px_rgba(0,0,0,0.28),0_10px_24px_rgba(0,0,0,0.18)]">
          <Suspense fallback={<p className="text-sm text-neutral-text">Loading…</p>}>
            <InviteForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
