export type DraftKind = "bill" | "renewal" | "income" | "note";

export type DraftItem = {
  title: string;
  kind: DraftKind;
  amount_cents: number | null;
  due_on: string | null;
  notes: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

function findDate(line: string, now: Date): { iso: string; raw: string } | null {
  const iso = line.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const value = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (value) return { iso: value, raw: iso[0] };
  }

  const slash = line.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    const value = isoDate(year, Number(slash[2]), Number(slash[1]));
    if (value) return { iso: value, raw: slash[0] };
  }

  const named = line.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    let year = now.getUTCFullYear();
    let value = isoDate(year, month, Number(named[1]));
    if (value && value < now.toISOString().slice(0, 10)) {
      value = isoDate(year + 1, month, Number(named[1]));
    }
    if (value) return { iso: value, raw: named[0] };
  }

  return null;
}

function findAmount(line: string): { cents: number; raw: string } | null {
  const match = line.match(/(?:aud\s*)?\$\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return { cents: Math.round(numeric * 100), raw: match[0] };
}

function kindFor(line: string, hasAmount: boolean, hasDate: boolean): DraftKind {
  if (/\b(renew\w*|rego|registration|expires|expiry)\b/i.test(line)) return "renewal";
  if (/\b(income|salary|wage|pay)\b/i.test(line)) return "income";
  if (hasAmount || hasDate) return "bill";
  return "note";
}

/** Split typed lines into items. Nothing is saved. Dates are read day-first when slashed. */
export function parseBrainDump(text: string, now: Date = new Date()): DraftItem[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 40);

  return lines.map((line) => {
    const dated = findDate(line, now);
    const amount = findAmount(line);
    let title = line;
    if (dated) title = title.replace(dated.raw, " ");
    if (amount) title = title.replace(amount.raw, " ");
    title = title.replace(/\s+/g, " ").replace(/^[,:\-–]+|[,:\-–]+$/g, "").trim();
    if (!title) title = line.slice(0, 120);
    return {
      title: title.slice(0, 160),
      kind: kindFor(line, Boolean(amount), Boolean(dated)),
      amount_cents: amount?.cents ?? null,
      due_on: dated?.iso ?? null,
      notes: null,
    };
  });
}
