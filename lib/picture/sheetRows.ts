import { parse } from "csv-parse/sync";

export const SHEET_TEMPLATE = [
  "name,type,amount,how_often,next_due_date,category,notes",
  "Rent,bill,450,monthly,2026-11-01,Housing,Paid from the joint account",
  "Pay,income,2400,fortnightly,2026-11-06,Pay,",
].join("\n");

export type SheetDraft = {
  title: string;
  kind: "bill" | "renewal" | "income" | "note";
  amount_cents: number | null;
  due_on: string | null;
  notes: string | null;
};

const KINDS = new Set(["bill", "renewal", "income", "note"]);

function cell(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function cents(value: string): number | null {
  const trimmed = value.replace(/[$,]/g, "").trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function dateOf(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!slash) return null;
  const day = slash[1].padStart(2, "0");
  const month = slash[2].padStart(2, "0");
  return `${slash[3]}-${month}-${day}`;
}

/** Parse a household spreadsheet in memory. The file is not stored. */
export function parseHouseholdSheet(text: string): { rows: SheetDraft[]; issues: string[] } {
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (header: string[]) => header.map((name) => name.trim().toLowerCase().replace(/\s+/g, "_")),
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    return { rows: [], issues: ["That file could not be read as a CSV."] };
  }

  const rows: SheetDraft[] = [];
  const issues: string[] = [];
  for (const record of records.slice(0, 40)) {
    const title = cell(record, ["name", "title"]).slice(0, 160);
    if (!title) continue;
    const rawKind = cell(record, ["type", "kind"]).toLowerCase();
    const kind = KINDS.has(rawKind) ? (rawKind as SheetDraft["kind"]) : "note";
    const amount = cents(cell(record, ["amount"]));
    const due = dateOf(cell(record, ["next_due_date", "due_date", "due_on"]));
    const notes = [
      cell(record, ["how_often", "cadence"]) ? `How often: ${cell(record, ["how_often", "cadence"])}` : "",
      cell(record, ["category"]) ? `Category: ${cell(record, ["category"])}` : "",
      cell(record, ["notes", "note"]),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 500);
    rows.push({
      title,
      kind,
      amount_cents: amount,
      due_on: due,
      notes: notes || null,
    });
  }
  if (!rows.length) issues.push("No named rows were found. Use the template columns.");
  return { rows, issues };
}
