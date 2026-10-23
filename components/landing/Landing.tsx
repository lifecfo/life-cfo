import Link from "next/link";

import { PRODUCT_DESCRIPTOR, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { WaitlistForm } from "./WaitlistForm";

export function Landing() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16 text-zinc-900">
      <header className="space-y-3">
        <p className="text-sm font-medium text-zinc-600">{PRODUCT_NAME}</p>
        <h1 className="text-4xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
        <p className="text-base leading-7 text-zinc-700">{PRODUCT_DESCRIPTOR}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">No bank login</h2>
        <p className="text-sm leading-6 text-zinc-700">
          You type the bills, renewals, dates, and notes. Life CFO does not ask for a bank login. People in the household see the same picture, including who is looking after each item. Due-date reminders appear in the app for everyone in the household. This beta does not email those reminders.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Who it is for</h2>
          <p className="text-sm leading-6 text-zinc-700">
            Adults who live in Australia. Couples and families where one person carries the money and admin load. Households that want one shared picture and will not share bank logins.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Who it is not for</h2>
          <p className="text-sm leading-6 text-zinc-700">
            Anyone under 18, or anyone who does not live in Australia. People who want a bank connection, a budget score, or someone to say what they should do.
          </p>
        </div>
      </section>

      <section className="space-y-2 rounded-3xl border border-zinc-200 p-5">
        <h2 className="text-xl font-semibold">Planned price</h2>
        <p className="text-sm leading-6 text-zinc-700">
          Planned price, not charged in this beta: A$7 a month or A$59 a year per household. No payment is taken now.
        </p>
        <p className="text-sm leading-6 text-zinc-700">
          A founding offer is not open. When it is, the price and what is included will be stated before anyone is asked to pay.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Hear when a place is open</h2>
        <p className="text-sm leading-6 text-zinc-700">
          The app itself is invite-only during this beta. This list is only a way to leave an email.
        </p>
        <WaitlistForm />
      </section>

      <footer className="flex flex-wrap gap-4 text-sm text-zinc-700">
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
    </main>
  );
}
