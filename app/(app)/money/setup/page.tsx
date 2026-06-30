"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Button, Card, CardContent } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";
import type {
  MoneyDataCoverage,
  MoneyFlowReadiness,
  MoneySetupStatus,
} from "@/lib/money/reasoning/types";

type OverviewResponse = {
  setup_status?: MoneySetupStatus;
  data_coverage?: MoneyDataCoverage;
  error?: string;
};

type StepLabel = "Done" | "Worth checking" | "When you can" | "Not needed yet" | "Ready";

type SetupStep = {
  key: string;
  title: string;
  detail: string;
  label: StepLabel;
  href?: string;
  opensAsk?: boolean;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function flowLabel(flow: MoneyFlowReadiness): StepLabel {
  if (flow.status === "ready") return "Done";
  if (flow.status === "needs_review" || flow.status === "refresh_needed") {
    return "Worth checking";
  }
  return "When you can";
}

function nextStepDetail(key: string, fallback: string) {
  switch (key) {
    case "refresh_sources":
      return "Refresh your money source so Life CFO can see the latest information.";
    case "add_source":
      return "Connect accounts, import transactions, or add them manually.";
    case "review_patterns":
      return "Check one regular payment or income item. This helps future summaries feel clearer.";
    case "add_bill_dates":
      return "Add bill dates when you can. This helps Life CFO look ahead.";
    case "add_income_timing":
      return "Check when regular income usually arrives. This helps Life CFO look ahead.";
    case "add_goal":
      return "Add one goal when you want Life CFO to understand what matters most.";
    default:
      return fallback;
  }
}

function StatusPill({ label }: { label: StepLabel }) {
  const tone =
    label === "Done" || label === "Ready"
      ? "bg-emerald-50 text-emerald-700"
      : label === "Worth checking"
        ? "bg-amber-50 text-amber-700"
        : "bg-zinc-100 text-zinc-600";

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function StepRow({ step, onAsk }: { step: SetupStep; onAsk: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-900">{step.title}</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-600">{step.detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusPill label={step.label} />
        {step.opensAsk ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAsk}>
            Ask
          </Button>
        ) : step.href ? (
          <Link
            href={step.href}
            className="rounded-lg px-2 py-1 text-xs font-medium text-brand-teal hover:bg-btn-ghostHover"
          >
            Open
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function MoneySetupPage() {
  const { openAsk } = useAsk();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch("/api/money/overview", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as OverviewResponse;
        if (!response.ok) throw new Error(json.error || "Life CFO couldn’t load this just now.");
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Life CFO couldn’t load this just now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupStatus = data?.setup_status;
  const dataCoverage = data?.data_coverage;
  const steps = useMemo<SetupStep[]>(() => {
    if (!setupStatus) return [];

    const { evidence, flows } = setupStatus;
    return [
      {
        key: "money",
        title: "Add your money",
        detail: setupStatus.usable_now
          ? "Your accounts or recent transactions are already in view."
          : "Connect accounts, import transactions, or add them manually.",
        label: setupStatus.usable_now
          ? "Done"
          : setupStatus.status === "refresh_needed"
            ? "Worth checking"
            : "When you can",
        href: "/connections",
      },
      {
        key: "income",
        title: "Check your income",
        detail:
          flows.in.status === "ready"
            ? "Life CFO can already see regular money coming in."
            : "Tell Life CFO which money coming in is regular.",
        label: flowLabel(flows.in),
        href: "/money/in",
      },
      {
        key: "bills",
        title: "Check your bills",
        detail:
          flows.out.status === "ready"
            ? "Life CFO can already see regular payments."
            : "Tell Life CFO which payments happen again and again.",
        label: flowLabel(flows.out),
        href: "/money/out",
      },
      {
        key: "bill-dates",
        title: "Add bill dates",
        detail: "Dates help Life CFO look ahead.",
        label:
          evidence.formal_bill_count > 0
            ? "Done"
            : evidence.confirmed_regular_payment_count > 0
              ? "When you can"
              : "Not needed yet",
        href: "/bills",
      },
      {
        key: "goal",
        title: "Add one goal",
        detail: "A goal helps Life CFO understand what matters to you.",
        label: evidence.goal_count > 0 ? "Done" : "When you can",
        href: "/money/goals",
      },
      {
        key: "ask",
        title: "Ask a question",
        detail: setupStatus.usable_now
          ? "Ask Life CFO about a real money question or decision."
          : "Ask once you have some money information in view.",
        label: setupStatus.usable_now ? "Ready" : "Not needed yet",
        opensAsk: true,
      },
    ];
  }, [setupStatus]);

  const alreadyHelping = steps.filter((step) => step.label === "Done" || step.label === "Ready");
  const whenYouCan = steps.filter((step) => step.label !== "Done" && step.label !== "Ready");
  const visibleFacts =
    dataCoverage && (dataCoverage.account_count > 0 || dataCoverage.transaction_count > 0)
      ? `${countLabel(dataCoverage.account_count, "account", "accounts")} and ${countLabel(
          dataCoverage.transaction_count,
          "recent transaction",
          "recent transactions"
        )} are in view${dataCoverage.has_demo_sources ? " from demo data" : ""}.`
      : null;

  return (
    <Page
      title="Start here"
      subtitle={
        <>
          <div>You don’t need to do everything now.</div>
          <div>These steps help Life CFO give you a clearer picture.</div>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        {error ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="text-sm text-zinc-700">{error}</CardContent>
          </Card>
        ) : null}

        {!error ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-2">
              <div className="text-lg font-semibold text-zinc-900">
                {loading
                  ? "Checking what Life CFO can see…"
                  : setupStatus?.usable_now
                    ? "You’ve added enough for Life CFO to help."
                    : "Start by adding your money."}
              </div>
              {visibleFacts ? <div className="text-sm text-zinc-600">{visibleFacts}</div> : null}
            </CardContent>
          </Card>
        ) : null}

        {setupStatus?.next_step ? (
          <Card className="border-zinc-200 bg-zinc-50 shadow-none">
            <CardContent className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                One useful next step
              </div>
              <div className="text-sm font-semibold text-zinc-900">
                {setupStatus.next_step.title}
              </div>
              <div className="text-sm leading-relaxed text-zinc-600">
                {nextStepDetail(setupStatus.next_step.key, setupStatus.next_step.detail)}
              </div>
              <Link
                href={setupStatus.next_step.href}
                className="inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                {setupStatus.next_step.action_label}
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {alreadyHelping.length > 0 ? (
          <section className="space-y-2" aria-labelledby="already-helping-title">
            <h2 id="already-helping-title" className="text-sm font-semibold text-zinc-900">
              Already helping
            </h2>
            {alreadyHelping.map((step) => (
              <StepRow key={step.key} step={step} onAsk={openAsk} />
            ))}
          </section>
        ) : null}

        {whenYouCan.length > 0 ? (
          <section className="space-y-2" aria-labelledby="when-you-can-title">
            <h2 id="when-you-can-title" className="text-sm font-semibold text-zinc-900">
              When you can
            </h2>
            {whenYouCan.map((step) => (
              <StepRow key={step.key} step={step} onAsk={openAsk} />
            ))}
          </section>
        ) : null}
      </div>
    </Page>
  );
}
