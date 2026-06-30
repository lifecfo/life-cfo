"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip } from "@/components/ui";

type CreateAccountResponse = {
  ok?: boolean;
  error?: string;
  account?: { id: string; name: string | null };
  next_href?: string;
};

export default function AddManualAccountPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("everyday");
  const [currency, setCurrency] = useState("AUD");
  const [currentBalance, setCurrentBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextHref, setNextHref] = useState<string | null>(null);

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/money/accounts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          account_type: accountType,
          currency,
          current_balance: currentBalance,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as CreateAccountResponse;
      if (!response.ok || !json.account?.id) {
        throw new Error(json.error || "Life CFO couldn’t add this account yet.");
      }

      setNextHref(json.next_href || `/money/import?accountId=${json.account.id}`);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Life CFO couldn’t add this account yet. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Add manual account"
      subtitle="Add an account yourself. You can upload transactions into it later."
    >
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <div>
          <Link href="/connections">
            <Chip>Back to Connections</Chip>
          </Link>
        </div>

        {nextHref ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Account added</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Done — you can upload a bank file next.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => router.push(nextHref)}>
                  Upload bank file
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push("/accounts")}>
                  View accounts
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <form className="space-y-4" onSubmit={(event) => void addAccount(event)}>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-800">Account name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="Everyday account"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-800">Account type</span>
                  <select
                    value={accountType}
                    onChange={(event) => setAccountType(event.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    <option value="everyday">Everyday</option>
                    <option value="savings">Savings</option>
                    <option value="credit_card">Credit card</option>
                    <option value="loan">Loan</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-800">Currency</span>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    <option value="AUD">AUD</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="NZD">NZD</option>
                    <option value="CAD">CAD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-800">Current balance</span>
                  <input
                    value={currentBalance}
                    onChange={(event) => setCurrentBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                  <span className="block text-xs text-zinc-500">
                    Leave this blank for zero. Use a minus sign for money owed.
                  </span>
                </label>

                {error ? <div className="text-sm text-zinc-600">{error}</div> : null}

                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Adding account…" : "Add account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
