// Shared en-AU date/time formatting for all user-facing copy.
//
// Two families, by what the input represents:
// - formatDate / formatDateShort / formatDateWithDay / formatMonthYear:
//   calendar-date display, no time shown. For a date-only value (a due
//   date, a target date, a deadline, a next-pay date -- anything stored
//   as "YYYY-MM-DD" or a midnight timestamp), resolve it with
//   parseDateOnly() first so the calendar day it names can never shift
//   because of the viewer's timezone.
// - formatTime / formatDateTime: show a time of day, using the viewer's
//   own local timezone (the runtime default -- there is no "fixed"
//   correct zone for a real moment). Because that default differs
//   between a server process and a browser, only call these once the
//   underlying timestamp has loaded client-side (this app's existing
//   pattern: real data is fetched after mount, not embedded via SSR) --
//   otherwise the first paint and the client hydration can disagree.

const LOCALE = "en-AU";

export type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

// Some ICU builds put a narrow no-break space (U+202F) or a plain
// no-break space (U+00A0) before "am"/"pm" instead of a normal space.
// Normalising keeps output stable across Node/browser ICU versions.
function normalizeSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

/**
 * Resolves a date-only value -- a "YYYY-MM-DD" string, a full ISO string
 * whose time component is incidental, or a stored UTC-midnight instant --
 * to the calendar date it names, independent of the viewer's timezone.
 * Use this before formatDate/formatDateShort/formatDateWithDay/
 * formatMonthYear for any due date, deadline, target date, or next-pay
 * date. Returns null if the input can't be parsed.
 */
export function parseDateOnly(input: DateInput): Date | null {
  if (input instanceof Date) {
    if (!isValid(input)) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }

  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isValid(d) ? d : null;
    }
  }

  const ms = typeof input === "number" ? input : Date.parse(String(input));
  if (!Number.isFinite(ms)) return null;
  const utc = new Date(ms);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** "29 Nov 2026" */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  return normalizeSpaces(
    new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(d)
  );
}

/** "29/11/2026" */
export function formatDateShort(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  return normalizeSpaces(
    new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
  );
}

/** "Sat 13 Mar 2027" */
export function formatDateWithDay(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  const s = new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  return normalizeSpaces(s.replace(",", ""));
}

/** "Nov 2026" */
export function formatMonthYear(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  return normalizeSpaces(new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" }).format(d));
}

/** "9:00 am" -- the viewer's local timezone, no seconds. */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  return normalizeSpaces(new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(d));
}

/** "29 Nov 2026, 9:00 am" -- the viewer's local timezone. */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!isValid(d)) return "";
  return `${formatDate(d)}, ${formatTime(d)}`;
}
