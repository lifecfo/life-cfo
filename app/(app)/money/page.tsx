// app/(app)/money/page.tsx
"use client";

import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

type Tile = {
  title: string;
  desc: string;
  href: string;
};

const tiles: Tile[] = [
  { title: "Goals", desc: "What you’re building toward — the anchor for “can we afford this?”", href: "/money/goals" },
  { title: "Accounts", desc: "Balances you’ve entered.", href: "/accounts" },
  { title: "Net Worth", desc: "Assets and liabilities together.", href: "/net-worth" },
  { title: "Liabilities", desc: "Debts and obligations.", href: "/liabilities" },
  { title: "Bills", desc: "Recurring bills and due dates.", href: "/bills" },
  { title: "Income", desc: "Recurring income schedule.", href: "/income" },
  { title: "Investments", desc: "Longer-term allocations.", href: "/investments" },
  { title: "Budget", desc: "Simple planning view.", href: "/budget" },
  { title: "Transactions", desc: "Activity and history.", href: "/transactions" },
];

export const dynamic = "force-dynamic";

export default function MoneyPage() {
  return (
    <Page
      title="Money"
      subtitle="A calm place for what’s true right now — and what you’re building toward."
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">Start with Goals</div>
              <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Read-only answers live in Home Ask</Chip>
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              Goals gives Keystone context. Without it, affordability is just arithmetic.
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="no-underline">
              <Card className="border-zinc-200 bg-white hover:bg-zinc-50 transition">
                <CardContent>
                  <div className="text-sm font-semibold text-zinc-900">{t.title}</div>
                  <div className="mt-1 text-sm text-zinc-600">{t.desc}</div>
                  <div className="mt-3">
                    <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Open</Chip>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Page>
  );
}
