export const AU_LOCALE_WARNING =
  "Your browser timezone and language do not look Australian. Life CFO is for people who live in Australia. You can continue if that is still true.";

/** True only for a plausible birth year of someone who is already 18. The year is not stored. */
export function birthYearIsAdult(year: number, now: Date = new Date()): boolean {
  if (!Number.isInteger(year)) return false;
  const nowYear = now.getFullYear();
  if (year > nowYear - 18) return false;
  if (year < nowYear - 120) return false;
  return true;
}

/**
 * Soft check only. Warn when neither the timezone nor the locale looks Australian.
 * If either looks Australian, there is no warning. Do not store these values.
 */
export function australiaSoftWarning(
  timeZone: string | null | undefined,
  locale: string | null | undefined
): string | null {
  const tz = String(timeZone || "").trim();
  const loc = String(locale || "").trim();
  const timezoneAustralian = tz.startsWith("Australia/");
  const localeAustralian = /^en-AU\b/i.test(loc);
  if (timezoneAustralian || localeAustralian) return null;
  return AU_LOCALE_WARNING;
}
