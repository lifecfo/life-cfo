import type { DraftItem, DraftKind } from "./parseBrainDump";

const KINDS: readonly DraftKind[] = ["bill", "renewal", "income", "note"];

function kindOf(value: unknown): DraftKind {
  return typeof value === "string" && KINDS.includes(value as DraftKind) ? (value as DraftKind) : "note";
}

function centsOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const cents = Math.round(value);
  if (cents < 0 || cents > 100_000_000_00) return null;
  return cents;
}

function dateOf(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

/** Keep only fields the household can confirm. Drops blank titles. */
export function sanitiseDraftItems(value: unknown): DraftItem[] {
  if (!Array.isArray(value)) return [];
  const items: DraftItem[] = [];
  for (const raw of value.slice(0, 40)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 160) : "";
    if (!title) continue;
    const notes = typeof row.notes === "string" && row.notes.trim() ? row.notes.trim().slice(0, 500) : null;
    items.push({
      title,
      kind: kindOf(row.kind),
      amount_cents: centsOf(row.amount_cents),
      due_on: dateOf(row.due_on),
      notes,
    });
  }
  return items;
}
