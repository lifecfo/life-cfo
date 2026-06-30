import { parse } from "csv-parse/sync";

export const BANK_CSV_MAX_ROWS = 10_000;

type DateFormat = "iso" | "dmy" | "mdy" | "ambiguous" | null;
type AmountMode = "signed" | "debit_credit" | null;

export type BankCsvDetectedColumns = {
  date: string | null;
  description: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  reference: string | null;
  currency: string | null;
  amount_mode: AmountMode;
  date_format: DateFormat;
};

export type BankCsvSampleRow = {
  date: string;
  description: string;
  amount: number | null;
  balance: number | null;
  reference: string | null;
};

export type BankCsvPreview = {
  ok: boolean;
  row_count: number;
  date_range: { start: string; end: string } | null;
  detected_columns: BankCsvDetectedColumns;
  sample_rows: BankCsvSampleRow[];
  issues: string[];
  warnings: string[];
  needs_user_choice: {
    date_format: boolean;
    amount_direction: boolean;
    account: boolean;
  };
};

const HEADER_ALIASES = {
  date: ["date", "transactiondate", "posteddate", "postingdate", "valuedate"],
  description: [
    "description",
    "transactiondescription",
    "details",
    "narrative",
    "merchant",
    "payee",
    "memo",
  ],
  amount: ["amount", "transactionamount", "value"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "moneyout"],
  credit: ["credit", "credits", "deposit", "deposits", "moneyin"],
  balance: ["balance", "runningbalance", "accountbalance"],
  reference: ["reference", "transactionid", "transactionreference", "id"],
  currency: ["currency", "currencycode"],
} as const;

function normalizedHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findColumn(headers: string[], aliases: readonly string[]): number | null {
  const index = headers.findIndex((header) => aliases.includes(normalizedHeader(header)));
  return index >= 0 ? index : null;
}

function cell(row: string[], index: number | null): string {
  return index === null ? "" : String(row[index] ?? "").trim();
}

function numberValue(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parenthesized = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[()]/g, "")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

function amountForRow(
  row: string[],
  columns: { amount: number | null; debit: number | null; credit: number | null },
  mode: AmountMode
): number | null {
  if (mode === "signed") return numberValue(cell(row, columns.amount));
  if (mode === "debit_credit") {
    const debit = numberValue(cell(row, columns.debit));
    const credit = numberValue(cell(row, columns.credit));
    if (debit !== null && credit !== null && debit !== 0 && credit !== 0) return null;
    if (debit !== null && debit !== 0) return -Math.abs(debit);
    if (credit !== null && credit !== 0) return Math.abs(credit);
  }
  return null;
}

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectDateFormat(values: string[]): DateFormat {
  const nonEmpty = values.filter(Boolean).slice(0, 100);
  if (!nonEmpty.length) return null;
  if (nonEmpty.every((value) => /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/.test(value))) {
    return "iso";
  }

  const slashDates = nonEmpty.map((value) => value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/));
  if (slashDates.some((match) => !match)) return null;
  const firstOverTwelve = slashDates.some((match) => Number(match?.[1]) > 12);
  const secondOverTwelve = slashDates.some((match) => Number(match?.[2]) > 12);
  if (firstOverTwelve && secondOverTwelve) return null;
  if (firstOverTwelve) return "dmy";
  if (secondOverTwelve) return "mdy";
  return "ambiguous";
}

function normalizedDate(value: string, format: DateFormat): string | null {
  if (format === "iso") {
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return match ? validIsoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  }
  if (format !== "dmy" && format !== "mdy") return null;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const yearRaw = Number(match[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  const day = format === "dmy" ? first : second;
  const month = format === "dmy" ? second : first;
  return validIsoDate(year, month, day);
}

function emptyDetectedColumns(): BankCsvDetectedColumns {
  return {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    balance: null,
    reference: null,
    currency: null,
    amount_mode: null,
    date_format: null,
  };
}

export function parseBankCsv(text: string): BankCsvPreview {
  const issues: string[] = [];
  const warnings: string[] = [];
  let records: string[][];

  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      max_record_size: 100_000,
    }) as string[][];
  } catch {
    return {
      ok: false,
      row_count: 0,
      date_range: null,
      detected_columns: emptyDetectedColumns(),
      sample_rows: [],
      issues: ["We couldn’t read this file safely."],
      warnings: [],
      needs_user_choice: { date_format: false, amount_direction: false, account: true },
    };
  }

  if (records.length < 2) {
    return {
      ok: false,
      row_count: 0,
      date_range: null,
      detected_columns: emptyDetectedColumns(),
      sample_rows: [],
      issues: ["This file does not contain any transaction rows."],
      warnings: [],
      needs_user_choice: { date_format: false, amount_direction: false, account: true },
    };
  }

  const headers = records[0].map((header) => String(header || "").replace(/^\uFEFF/, "").trim());
  const rows = records.slice(1);
  if (rows.length > BANK_CSV_MAX_ROWS) {
    issues.push(`This file has more than ${BANK_CSV_MAX_ROWS.toLocaleString()} rows.`);
  }

  const indexes = {
    date: findColumn(headers, HEADER_ALIASES.date),
    description: findColumn(headers, HEADER_ALIASES.description),
    amount: findColumn(headers, HEADER_ALIASES.amount),
    debit: findColumn(headers, HEADER_ALIASES.debit),
    credit: findColumn(headers, HEADER_ALIASES.credit),
    balance: findColumn(headers, HEADER_ALIASES.balance),
    reference: findColumn(headers, HEADER_ALIASES.reference),
    currency: findColumn(headers, HEADER_ALIASES.currency),
  };
  const amountMode: AmountMode =
    indexes.amount !== null
      ? "signed"
      : indexes.debit !== null && indexes.credit !== null
        ? "debit_credit"
        : null;
  const dateFormat = detectDateFormat(rows.map((row) => cell(row, indexes.date)));
  const detectedColumns: BankCsvDetectedColumns = {
    date: indexes.date === null ? null : headers[indexes.date],
    description: indexes.description === null ? null : headers[indexes.description],
    amount: indexes.amount === null ? null : headers[indexes.amount],
    debit: indexes.debit === null ? null : headers[indexes.debit],
    credit: indexes.credit === null ? null : headers[indexes.credit],
    balance: indexes.balance === null ? null : headers[indexes.balance],
    reference: indexes.reference === null ? null : headers[indexes.reference],
    currency: indexes.currency === null ? null : headers[indexes.currency],
    amount_mode: amountMode,
    date_format: dateFormat,
  };

  if (indexes.date === null) issues.push("We couldn’t find a date column.");
  if (indexes.description === null) issues.push("We couldn’t find a description column.");
  if (amountMode === null) issues.push("We couldn’t find an amount column or debit and credit columns.");
  if (indexes.date !== null && dateFormat === null) {
    issues.push("Some dates could not be read safely.");
  }
  if (dateFormat === "ambiguous") {
    warnings.push("The dates could be day/month or month/day. You’ll choose the format before importing.");
  }

  const amounts = amountMode
    ? rows.map((row) => amountForRow(row, indexes, amountMode)).filter((value): value is number => value !== null)
    : [];
  const amountDirectionChoice = amountMode === "signed" && amounts.length > 0 && amounts.every((amount) => amount >= 0);
  if (amountDirectionChoice) {
    warnings.push("All amounts are positive. You’ll confirm which rows are money in or money out before importing.");
  }

  const readableDates = rows
    .map((row) => normalizedDate(cell(row, indexes.date), dateFormat))
    .filter((value): value is string => Boolean(value))
    .sort();
  const invalidAmountRows = amountMode
    ? rows.filter((row) => amountForRow(row, indexes, amountMode) === null).length
    : rows.length;
  const invalidDateRows =
    dateFormat === "iso" || dateFormat === "dmy" || dateFormat === "mdy"
      ? rows.filter((row) => !normalizedDate(cell(row, indexes.date), dateFormat)).length
      : 0;
  const blankDescriptionRows =
    indexes.description === null ? rows.length : rows.filter((row) => !cell(row, indexes.description)).length;
  if (amountMode && invalidAmountRows === rows.length) {
    issues.push("None of the transaction amounts could be read safely.");
  }
  if (
    (dateFormat === "iso" || dateFormat === "dmy" || dateFormat === "mdy") &&
    invalidDateRows === rows.length
  ) {
    issues.push("None of the transaction dates could be read safely.");
  }
  if (indexes.description !== null && blankDescriptionRows === rows.length) {
    issues.push("None of the transaction descriptions could be read safely.");
  }
  if (amountMode && invalidAmountRows > 0 && invalidAmountRows < rows.length) {
    warnings.push(`${invalidAmountRows} row${invalidAmountRows === 1 ? " has" : "s have"} an amount that needs attention.`);
  }
  if (invalidDateRows > 0 && invalidDateRows < rows.length) {
    warnings.push(`${invalidDateRows} row${invalidDateRows === 1 ? " has" : "s have"} a date that needs attention.`);
  }
  if (
    indexes.description !== null &&
    blankDescriptionRows > 0 &&
    blankDescriptionRows < rows.length
  ) {
    warnings.push(`${blankDescriptionRows} row${blankDescriptionRows === 1 ? " has" : "s have"} no description.`);
  }

  const sampleRows = rows.slice(0, 5).map((row): BankCsvSampleRow => ({
    date: cell(row, indexes.date),
    description: cell(row, indexes.description) || "No description",
    amount: amountMode ? amountForRow(row, indexes, amountMode) : null,
    balance: numberValue(cell(row, indexes.balance)),
    reference: cell(row, indexes.reference) || null,
  }));

  return {
    ok: issues.length === 0,
    row_count: rows.length,
    date_range:
      readableDates.length === rows.length && readableDates.length > 0
        ? { start: readableDates[0], end: readableDates[readableDates.length - 1] }
        : null,
    detected_columns: detectedColumns,
    sample_rows: sampleRows,
    issues,
    warnings,
    needs_user_choice: {
      date_format: dateFormat === "ambiguous",
      amount_direction: amountDirectionChoice,
      account: true,
    },
  };
}
