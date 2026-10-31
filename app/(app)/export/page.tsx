// app/(app)/export/page.tsx
import Image from "next/image";
import Link from "next/link";

import { PrintPackButton } from "@/components/decisions/PrintPackButton";
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "@/lib/brand";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { buildExportPack } from "@/lib/picture/exportPack";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { formatDateShort, parseDateOnly } from "@/lib/format/dates";

export const dynamic = "force-dynamic";

function auDate(iso: string | null): string {
  if (!iso) return "";
  const d = parseDateOnly(iso);
  return d ? formatDateShort(d) : iso;
}

export default async function ExportPage() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="p-6 text-sm">Sign in to open this summary.</p>;
  }

  const householdId = await resolveHouseholdIdRoute(supabase, user.id);
  if (!householdId) {
    return <p className="p-6 text-sm">Set up a household first, then come back to this page.</p>;
  }

  const [household, accounts, income, bills, goals, transactions] = await Promise.all([
    supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
    supabase
      .from("accounts")
      .select("name,type,currency,current_balance_cents,archived")
      .eq("household_id", householdId),
    supabase
      .from("recurring_income")
      .select("name,amount_cents,currency,cadence,active")
      .eq("household_id", householdId),
    supabase
      .from("recurring_bills")
      .select("name,amount_cents,currency,cadence,autopay,active")
      .eq("household_id", householdId),
    supabase
      .from("money_goals")
      .select("title,currency,target_cents,current_cents,status,deadline_at")
      .eq("household_id", householdId),
    supabase
      .from("transactions")
      .select("date,category,amount_cents")
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .limit(500),
  ]);

  const pack = buildExportPack({
    accounts: accounts.data ?? [],
    income: income.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    transactions: transactions.data ?? [],
  });

  const householdName = household.data?.name?.trim() || "Household";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8 text-neutral-text">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link className="text-sm underline" href="/settings">
          Back to settings
        </Link>
        <PrintPackButton />
      </div>

      <header className="space-y-3">
        <Image
          src="/brand/lifecfo-horizontal-transparent.svg"
          alt={PRODUCT_NAME}
          width={170}
          height={40}
          className="h-auto w-[150px]"
        />
        <p className="text-sm text-neutral-text-2">{PRODUCT_DESCRIPTOR}</p>
        <h1 className="text-3xl font-semibold">Financial summary</h1>
        <p className="text-sm text-neutral-text-2">
          {householdName} · Generated {auDate(pack.generated_at.slice(0, 10))}
        </p>
        <p className="text-sm leading-6 text-zinc-700">{pack.note}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Accounts</h2>
        {pack.total_balance_by_currency.length ? (
          <p className="text-sm font-medium text-zinc-900">
            Total: {pack.total_balance_by_currency.map((row) => formatMoneyFromCents(row.cents, row.currency)).join(" · ")}
          </p>
        ) : null}
        {pack.accounts.length === 0 ? (
          <p className="text-sm text-zinc-600">No accounts entered.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Account</th>
                <th className="py-1 pr-4 font-medium">Type</th>
                <th className="py-1 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pack.accounts.map((account, index) => (
                <tr key={`${account.name}-${index}`}>
                  <td className="py-1.5 pr-4">{account.name}</td>
                  <td className="py-1.5 pr-4 text-zinc-600">{account.type}</td>
                  <td className="py-1.5">{formatMoneyFromCents(account.balance_cents, account.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Income</h2>
        <p className="text-sm font-medium text-zinc-900">
          Monthly equivalent total: {formatMoneyFromCents(pack.monthly_income_total_cents, "AUD")}
        </p>
        {pack.income.length === 0 ? (
          <p className="text-sm text-zinc-600">No income entered.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Source</th>
                <th className="py-1 pr-4 font-medium">Amount</th>
                <th className="py-1 font-medium">Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pack.income.map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  <td className="py-1.5 pr-4">{row.name}</td>
                  <td className="py-1.5 pr-4">{formatMoneyFromCents(row.amount_cents, row.currency)}</td>
                  <td className="py-1.5 text-zinc-600">{row.cadence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Regular bills and commitments</h2>
        <p className="text-sm font-medium text-zinc-900">
          Monthly equivalent total: {formatMoneyFromCents(pack.monthly_bills_total_cents, "AUD")}
        </p>
        {pack.bills.length === 0 ? (
          <p className="text-sm text-zinc-600">No bills entered.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Bill</th>
                <th className="py-1 pr-4 font-medium">Amount</th>
                <th className="py-1 font-medium">Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pack.bills.map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  <td className="py-1.5 pr-4">{row.name}</td>
                  <td className="py-1.5 pr-4">{formatMoneyFromCents(row.amount_cents, row.currency)}</td>
                  <td className="py-1.5 text-zinc-600">{row.cadence}{row.autopay ? " · autopay" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Goals</h2>
        {pack.goals.length === 0 ? (
          <p className="text-sm text-zinc-600">No goals entered.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Goal</th>
                <th className="py-1 pr-4 font-medium">Saved / target</th>
                <th className="py-1 font-medium">Target date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pack.goals.map((row, index) => (
                <tr key={`${row.title}-${index}`}>
                  <td className="py-1.5 pr-4">{row.title}</td>
                  <td className="py-1.5 pr-4">
                    {formatMoneyFromCents(row.current_cents, row.currency)} /{" "}
                    {formatMoneyFromCents(row.target_cents, row.currency)} ({row.percent}%)
                  </td>
                  <td className="py-1.5 text-zinc-600">{row.deadline ? auDate(row.deadline) : "No date set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Spending, last 30 days</h2>
        <p className="text-sm font-medium text-zinc-900">
          Total: {formatMoneyFromCents(pack.spending_last_30_days.total_cents, "AUD")}
        </p>
        {pack.spending_last_30_days.by_category.length === 0 ? (
          <p className="text-sm text-zinc-600">No spending imported in this period.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Category</th>
                <th className="py-1 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pack.spending_last_30_days.by_category.map((row) => (
                <tr key={row.category}>
                  <td className="py-1.5 pr-4">{row.category}</td>
                  <td className="py-1.5">{formatMoneyFromCents(row.cents, "AUD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-sm leading-6 text-zinc-700">{pack.note}</p>
    </main>
  );
}
