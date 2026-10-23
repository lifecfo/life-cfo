import { z } from "zod";

import { sanitiseDraftItems } from "./draftItems";
import type { DraftItem } from "./parseBrainDump";

const BLOCKED_CATEGORY =
  /\b(should|ought|recommend\w*|suggest\w*|better|good idea|vanguard|hostplus|betashares|commsec|stake|afterpay)\b/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReceiptLine = {
  description: string;
  amount_cents: number | null;
};

export type ReceiptFacts = {
  merchant: string | null;
  date: string | null;
  total_cents: number | null;
  gst_cents: number | null;
  due_on: string | null;
  line_items: ReceiptLine[];
  category: string | null;
};

export const EMPTY_RECEIPT_FACTS: ReceiptFacts = {
  merchant: null,
  date: null,
  total_cents: null,
  gst_cents: null,
  due_on: null,
  line_items: [],
  category: null,
};

const ReceiptFactsSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  total_cents: z.number().nullable(),
  gst_cents: z.number().nullable(),
  due_on: z.string().nullable(),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        amount_cents: z.number().nullable(),
      })
    )
    .nullable()
    .optional(),
  category: z.string().nullable(),
});

export const ReceiptFactsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { anyOf: [{ type: "string" }, { type: "null" }] },
    date: { anyOf: [{ type: "string" }, { type: "null" }] },
    total_cents: { anyOf: [{ type: "integer" }, { type: "null" }] },
    gst_cents: { anyOf: [{ type: "integer" }, { type: "null" }] },
    due_on: { anyOf: [{ type: "string" }, { type: "null" }] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          amount_cents: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: ["description", "amount_cents"],
      },
    },
    category: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["merchant", "date", "total_cents", "gst_cents", "due_on", "line_items", "category"],
};

function centsOf(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const cents = Math.round(value);
  if (cents < 0 || cents > 100_000_000_00) return null;
  return cents;
}

function dateOf(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function textOf(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export function categoriesSafeForReceiptRead(names: readonly string[]): string[] {
  const kept: string[] = [];
  for (const name of names) {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed || BLOCKED_CATEGORY.test(trimmed)) continue;
    if (kept.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    kept.push(trimmed);
    if (kept.length >= 40) break;
  }
  return kept;
}

function matchCategory(value: string | null, names: readonly string[]): string | null {
  if (!value) return null;
  const wanted = value.trim().toLowerCase();
  return names.find((name) => name.trim().toLowerCase() === wanted) ?? null;
}

/** Keep printed facts only. A category is kept when it is one of the household's names. */
export function sanitiseReceiptFacts(value: unknown, categoryNames: readonly string[]): ReceiptFacts | null {
  const parsed = ReceiptFactsSchema.safeParse(value);
  if (!parsed.success) return null;
  const allowed = categoriesSafeForReceiptRead(categoryNames);
  const total = centsOf(parsed.data.total_cents);
  let gst = centsOf(parsed.data.gst_cents);
  if (gst != null && total != null && gst > total) gst = null;
  const lineItems: ReceiptLine[] = [];
  for (const line of parsed.data.line_items ?? []) {
    const description = textOf(line.description, 120);
    if (!description) continue;
    lineItems.push({ description, amount_cents: centsOf(line.amount_cents) });
    if (lineItems.length >= 20) break;
  }
  return {
    merchant: textOf(parsed.data.merchant, 160),
    date: dateOf(parsed.data.date),
    total_cents: total,
    gst_cents: gst,
    due_on: dateOf(parsed.data.due_on),
    line_items: lineItems,
    category: matchCategory(textOf(parsed.data.category, 80), allowed),
  };
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Fields for the confirm list. Empty strings stay empty so the person can type them. */
export function draftFromReceiptFacts(facts: ReceiptFacts): DraftItem {
  const notes: string[] = [];
  if (facts.date && facts.date !== facts.due_on) notes.push(`Receipt date: ${facts.date}`);
  if (facts.gst_cents != null) notes.push(`GST: $${dollars(facts.gst_cents)}`);
  if (facts.category) notes.push(`Category: ${facts.category}`);
  if (facts.line_items.length) {
    notes.push(
      facts.line_items
        .map((line) =>
          line.amount_cents == null ? line.description : `${line.description} $${dollars(line.amount_cents)}`
        )
        .join("; ")
    );
  }
  const joined = notes.join("\n").slice(0, 500);
  const dated = facts.due_on ?? facts.date;
  const hasBillShape = facts.total_cents != null || dated != null;
  return {
    title: facts.merchant ?? "",
    kind: hasBillShape ? "bill" : "note",
    amount_cents: facts.total_cents,
    due_on: dated,
    notes: joined || null,
  };
}

export function receiptReadPrompt(categoryNames: readonly string[]): string {
  const names = categoriesSafeForReceiptRead(categoryNames);
  const categoryLine = names.length
    ? `category is one of these existing names, or null: ${names.join(", ")}.`
    : "category is null.";
  return [
    "Read the receipt or bill image. Return only facts that are printed.",
    "merchant is the seller or payee, or null.",
    "date is the receipt or invoice date as YYYY-MM-DD, or null.",
    "total_cents is the total in integer cents, or null.",
    "gst_cents is GST if it is printed, in integer cents, or null.",
    "due_on is a due date if one is printed, as YYYY-MM-DD, or null.",
    "line_items lists printed lines. Use an empty array when lines are not printed. Do not invent lines.",
    categoryLine,
    "Leave a field null when it is not printed.",
  ].join(" ");
}

export const RECEIPT_READ_SYSTEM =
  "Extract only facts printed on the image. Dates are YYYY-MM-DD. Amounts are integer cents. category must be one of the names in the user message, or null. Do not add facts.";

export type ConfirmedItem = {
  item: DraftItem;
  receiptId: string | null;
};

function receiptIdOf(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Same title filter as the confirm list, keeping a receipt id beside each kept row. */
export function confirmedItemsWithReceipts(value: unknown): ConfirmedItem[] {
  if (!Array.isArray(value)) return [];
  const rows: ConfirmedItem[] = [];
  for (const raw of value.slice(0, 40)) {
    const [item] = sanitiseDraftItems([raw]);
    if (!item) continue;
    const receiptId =
      raw && typeof raw === "object" ? receiptIdOf((raw as { receipt_id?: unknown }).receipt_id) : null;
    rows.push({ item, receiptId });
  }
  return rows;
}
