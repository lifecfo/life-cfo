"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Page } from "@/components/Page";
import { Button, Card, CardContent } from "@/components/ui";

type Pattern = {
  pattern_key: string;
  label: string;
  occurrences: number;
  average_cents: number;
  currency: string;
  cadence: string;
  detected_kind: "bill" | "income";
};

type Review = {
  ok?: boolean;
  error?: string;
  imported?: boolean;
  categories?: Array<{ name: string; cents: number }>;
  month_outflow?: Array<{ currency: string; cents: number }>;
  patterns?: Pattern[];
  photos?: Array<{ id: string; created_at: string }>;
};

function money(cents: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);
}

export default function SpendingPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [tab, setTab] = useState<"totals" | "check">("check");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/spending/review", { cache: "no-store" });
    const json = (await response.json().catch(() => null)) as Review | null;
    setReview(json);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function confirm(pattern: Pattern, kind: "bill" | "income" | "ignore") {
    setMessage(null);
    const response = await fetch("/api/money/pattern-confirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern_key: pattern.pattern_key,
        kind: kind === "ignore" ? "ignore" : kind,
        label: pattern.label,
        amount_cents: pattern.average_cents,
        currency: pattern.currency,
        cadence: pattern.cadence === "repeated" ? "monthly" : pattern.cadence,
      }),
    });
    if (!response.ok) {
      setMessage("That row could not be saved.");
      return;
    }
    if (kind !== "ignore") {
      const cadenceNote = pattern.cadence === "monthly" ? "Repeats monthly." : `Repeats ${pattern.cadence}.`;
      await fetch("/api/picture/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          items: [
            {
              title: pattern.label,
              kind,
              amount_cents: pattern.average_cents,
              due_on: null,
              notes: cadenceNote,
            },
          ],
        }),
      });
    }
    await load();
  }

  const patterns = review?.patterns ?? [];

  return (
    <Page title="Spending" subtitle="Totals from imported rows, and rows waiting for you to confirm.">
      <div className="mx-auto max-w-[760px] space-y-4">
        {!review?.imported ? (
          <p className="text-sm leading-6 text-zinc-600">
            Nothing has been imported yet.{" "}
            <Link className="underline" href="/money/import">
              Upload a bank file (CSV)
            </Link>
            .
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant={tab === "totals" ? "primary" : "secondary"} onClick={() => setTab("totals")}>
            Totals
          </Button>
          <Button type="button" variant={tab === "check" ? "primary" : "secondary"} onClick={() => setTab("check")}>
            Check and confirm
          </Button>
        </div>
        {tab === "totals" ? (
          <Card>
            <CardContent className="space-y-3">
              {(review?.month_outflow ?? []).map((row) => (
                <p key={row.currency} className="text-sm text-zinc-800">
                  Money out this month: {money(row.cents, row.currency)}
                </p>
              ))}
              <div className="space-y-1">
                {(review?.categories ?? []).map((row) => (
                  <p key={row.name} className="text-sm text-zinc-700">
                    {row.name}: {money(row.cents)}
                  </p>
                ))}
              </div>
              {patterns.some((pattern) => pattern.cadence === "monthly") ? (
                <p className="text-sm text-zinc-600">Some descriptions repeat monthly. Confirm them before they are saved as bills or income.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {patterns.length === 0 ? <p className="text-sm text-zinc-600">No imported rows are waiting.</p> : null}
            {patterns.map((pattern) => (
              <Card key={pattern.pattern_key}>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium text-zinc-900">{pattern.label}</p>
                  <p className="text-sm text-zinc-600">
                    {money(pattern.average_cents, pattern.currency)} · seen {pattern.occurrences} times · {pattern.cadence}
                    {pattern.cadence === "monthly" ? " · repeats monthly" : ""}
                  </p>
                  <p className="text-sm text-zinc-800">Is this a bill, income, or ignore?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void confirm(pattern, "bill")}>
                      Bill
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void confirm(pattern, "income")}>
                      Income
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void confirm(pattern, "ignore")}>
                      Ignore
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(review?.photos ?? []).map((photo) => (
              <Card key={photo.id}>
                <CardContent className="space-y-1">
                  <p className="text-sm text-zinc-800">A receipt photo is stored and not linked to an item yet.</p>
                  <Link className="text-sm underline" href="/start">
                    Open Add things
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      </div>
    </Page>
  );
}
