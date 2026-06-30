"use client";

import { useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip } from "@/components/ui";
import type {
  BankCsvDetectedColumns,
  BankCsvSampleRow,
} from "@/lib/money/import/parseBankCsv";

type AccountChoice = {
  id: string;
  name: string | null;
  currency: string | null;
};

type PreviewResponse = {
  ok: boolean;
  error?: string;
  row_count?: number;
  date_range?: { start: string; end: string } | null;
  detected_columns?: BankCsvDetectedColumns;
  sample_rows?: BankCsvSampleRow[];
  issues?: string[];
  warnings?: string[];
  account_choices?: AccountChoice[];
  needs_user_choice?: {
    date_format: boolean;
    amount_direction: boolean;
    account: boolean;
  };
};

function displayDate(value: string) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function displayAmount(value: number | null) {
  if (value === null) return "Needs checking";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "auto",
  }).format(value);
}

function foundColumns(columns: BankCsvDetectedColumns | undefined) {
  if (!columns) return [] as Array<{ label: string; value: string }>;
  return [
    { label: "Date", value: columns.date },
    { label: "Description", value: columns.description },
    { label: "Amount", value: columns.amount },
    { label: "Money out", value: columns.debit },
    { label: "Money in", value: columns.credit },
    { label: "Balance", value: columns.balance },
    { label: "Reference", value: columns.reference },
    { label: "Currency", value: columns.currency },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

export default function MoneyImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkFile() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/money/import/csv/preview", {
        method: "POST",
        body: form,
      });
      const json = (await response.json().catch(() => ({}))) as PreviewResponse;
      if (!response.ok) throw new Error(json.error || "We couldn’t read this file safely.");
      setPreview(json);
      const firstAccount = json.account_choices?.[0]?.id || "";
      setSelectedAccountId(firstAccount);
    } catch (checkError: unknown) {
      setError(
        checkError instanceof Error && checkError.message
          ? checkError.message
          : "We couldn’t read this file safely."
      );
    } finally {
      setLoading(false);
    }
  }

  const columns = foundColumns(preview?.detected_columns);
  const accounts = preview?.account_choices ?? [];

  return (
    <Page
      title="Upload a bank file"
      subtitle="Life CFO will check it before anything is saved."
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div>
          <Link href="/money/setup">
            <Chip>Back to Start here</Chip>
          </Link>
        </div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Choose a CSV file from your bank</div>
              <div className="mt-1 text-xs text-zinc-600">Nothing will be saved while Life CFO checks it.</div>
            </div>
            <input
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
            />
            <Button type="button" onClick={() => void checkFile()} disabled={!file || loading}>
              {loading ? "Checking file…" : "Check the preview"}
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">We couldn’t read this file safely.</div>
              <div className="text-sm text-zinc-600">{error}</div>
              <div className="text-xs text-zinc-500">Try a CSV with date, description, and amount columns.</div>
            </CardContent>
          </Card>
        ) : null}

        {preview ? (
          <>
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {preview.ok ? "Check the preview" : "We couldn’t read this file safely."}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Nothing has been saved yet.</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Transactions found</div>
                    <div className="mt-0.5 text-sm font-medium text-zinc-900">{preview.row_count ?? 0}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Date range</div>
                    <div className="mt-0.5 text-sm font-medium text-zinc-900">
                      {preview.date_range
                        ? `${displayDate(preview.date_range.start)} to ${displayDate(preview.date_range.end)}`
                        : "Needs checking"}
                    </div>
                  </div>
                </div>

                {columns.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">What Life CFO found</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {columns.map((column) => (
                        <span key={column.label} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                          {column.label}: {column.value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {(preview.issues?.length || preview.warnings?.length) ? (
              <Card className="border-zinc-200 bg-white">
                <CardContent className="space-y-3">
                  {preview.issues?.length ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Please check this file</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-zinc-600">
                        {preview.issues.map((issue) => <li key={issue}>{issue}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {preview.warnings?.length ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Worth checking</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-zinc-600">
                        {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {preview.sample_rows?.length ? (
              <Card className="border-zinc-200 bg-white">
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">Sample transactions</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr className="border-b border-zinc-200">
                          <th className="px-2 py-2 font-medium">Date</th>
                          <th className="px-2 py-2 font-medium">Description</th>
                          <th className="px-2 py-2 text-right font-medium">Amount</th>
                          {preview.detected_columns?.balance ? <th className="px-2 py-2 text-right font-medium">Balance</th> : null}
                          {preview.detected_columns?.reference ? <th className="px-2 py-2 font-medium">Reference</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-700">
                        {preview.sample_rows.map((row, index) => (
                          <tr key={`${row.date}_${row.reference || index}`}>
                            <td className="px-2 py-2 whitespace-nowrap">{row.date}</td>
                            <td className="max-w-[260px] truncate px-2 py-2">{row.description}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{displayAmount(row.amount)}</td>
                            {preview.detected_columns?.balance ? <td className="px-2 py-2 text-right tabular-nums">{displayAmount(row.balance)}</td> : null}
                            {preview.detected_columns?.reference ? <td className="px-2 py-2">{row.reference || "—"}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Choose which account this file belongs to</div>
                  <div className="mt-1 text-xs text-zinc-600">Nothing will be linked or created in this preview.</div>
                </div>
                {accounts.length ? (
                  <select
                    value={selectedAccountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name || "Manual account"}{account.currency ? ` (${account.currency})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-zinc-600">
                    You’ll choose or create an account before importing in the next step.
                  </div>
                )}
                <Button type="button" disabled>
                  Import coming next
                </Button>
                <div className="text-xs text-zinc-500">Nothing has been saved yet.</div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Page>
  );
}
