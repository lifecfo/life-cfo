"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

type ImportResponse = {
  ok?: boolean;
  error?: string;
  imported?: number;
  already_present?: number;
  rejected?: number;
  date_range?: { start: string; end: string } | null;
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

function MoneyImportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  async function checkFile() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    setLoading(true);
    setError(null);
    setImportError(null);
    setImportResult(null);
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
      const requestedAccountId = searchParams.get("accountId") || "";
      const requestedAccountExists = json.account_choices?.some(
        (account) => account.id === requestedAccountId
      );
      setSelectedAccountId(
        requestedAccountExists ? requestedAccountId : json.account_choices?.[0]?.id || ""
      );
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

  async function importTransactions() {
    if (!file || !selectedAccountId) return;

    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("account_id", selectedAccountId);
      const response = await fetch("/api/money/import/csv/commit", {
        method: "POST",
        body: form,
      });
      const json = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok) {
        throw new Error(json.error || "Life CFO couldn’t import this file yet.");
      }
      setImportResult(json);
    } catch (commitError: unknown) {
      setImportError(
        commitError instanceof Error && commitError.message
          ? commitError.message
          : "Life CFO couldn’t import this file yet. Please try again."
      );
    } finally {
      setImporting(false);
    }
  }

  const columns = foundColumns(preview?.detected_columns);
  const accounts = preview?.account_choices ?? [];
  const needsAnotherChoice = Boolean(
    preview?.needs_user_choice?.date_format ||
      preview?.needs_user_choice?.amount_direction
  );
  const canImport = Boolean(
    preview?.ok && selectedAccountId && !needsAnotherChoice && file
  );

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
                setImportError(null);
                setImportResult(null);
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

            {importResult?.ok ? (
              <Card className="border-zinc-200 bg-white">
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Import complete</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Done — Life CFO can use these transactions.
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                      Imported: {importResult.imported ?? 0}
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                      Already here: {importResult.already_present ?? 0}
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                      Could not import: {importResult.rejected ?? 0}
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                      Date range: {importResult.date_range
                        ? `${displayDate(importResult.date_range.start)} to ${displayDate(importResult.date_range.end)}`
                        : "Not available"}
                    </div>
                  </div>
                  <Link href="/transactions">
                    <Chip>View transactions</Chip>
                  </Link>
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
                  <div className="space-y-2">
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
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => router.push("/money/accounts/new")}
                    >
                      Create a new account
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-600">Add an account first.</div>
                    <Button
                      type="button"
                      onClick={() => router.push("/money/accounts/new")}
                    >
                      Add manual account
                    </Button>
                  </div>
                )}
                {needsAnotherChoice ? (
                  <div className="text-sm text-zinc-600">
                    This file needs one more check before it can be imported.
                  </div>
                ) : null}
                {importError ? <div className="text-sm text-zinc-600">{importError}</div> : null}
                <Button
                  type="button"
                  disabled={!canImport || importing}
                  onClick={() => void importTransactions()}
                >
                  {importing ? "Importing…" : "Import transactions"}
                </Button>
                {!importResult?.ok ? (
                  <div className="text-xs text-zinc-500">Nothing has been saved yet.</div>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Page>
  );
}

export default function MoneyImportPage() {
  return (
    <Suspense fallback={null}>
      <MoneyImportPageContent />
    </Suspense>
  );
}
