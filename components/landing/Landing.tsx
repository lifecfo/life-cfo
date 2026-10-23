import Image from "next/image";
import Link from "next/link";

import { PRODUCT_DESCRIPTOR, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { WaitlistForm } from "./WaitlistForm";

export function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-brand-teal to-[#174544] px-4 py-12 text-neutral-text">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto max-w-3xl space-y-8">
        <header className="space-y-4 text-center">
          <Image
            src="/brand/lifecfo-logo-stacked-white-transparent.svg"
            alt={PRODUCT_NAME}
            width={220}
            height={220}
            priority
            className="mx-auto h-auto w-[180px] sm:w-[220px]"
          />
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{PRODUCT_TAGLINE}</h1>
          <p className="text-sm leading-relaxed text-white/85">{PRODUCT_DESCRIPTOR}</p>
        </header>

        <section className="rounded-2xl border border-white/20 bg-neutral-surface p-6 shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
          <h2 className="text-base font-semibold">No bank login</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-text-2">
            You type the bills, renewals, dates, and notes. People in the household see the same picture, including who is looking after each item. Due-date reminders appear in the app for everyone in the household. This beta does not email those reminders.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/20 bg-neutral-surface p-6">
            <h2 className="text-base font-semibold">Who it is for</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-text-2">
              Adults who live in Australia. Couples and families where one person carries the money and admin load. Households that want one shared picture and will not share bank logins.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-neutral-surface p-6">
            <h2 className="text-base font-semibold">Who it is not for</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-text-2">
              Anyone under 18, or anyone who does not live in Australia. People who want a bank connection, a budget score, or someone to say what they should do.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-neutral-surface p-6">
          <h2 className="text-base font-semibold">Planned price</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-text-2">
            Planned price, not charged in this beta: A$7 a month or A$59 a year per household. No payment is taken now.
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-text-2">
            A founding offer is not open. When it is, the price and what is included will be stated before anyone is asked to pay.
          </p>
        </section>

        <section className="rounded-2xl border border-white/20 bg-neutral-surface p-6">
          <h2 className="text-base font-semibold">Hear when a place is open</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-text-2">
            The app itself is invite-only during this beta. This list is only a way to leave an email.
          </p>
          <div className="mt-4">
            <WaitlistForm />
          </div>
        </section>

        <footer className="flex flex-wrap justify-center gap-4 text-sm text-white/85">
          <Link className="underline" href="/login">
            Sign in
          </Link>
          <Link className="underline" href="/privacy">
            Privacy
          </Link>
          <Link className="underline" href="/terms">
            Terms
          </Link>
        </footer>
      </div>
    </main>
  );
}
