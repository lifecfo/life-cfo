/** Drop BSB-like and long digit runs before a bank row is stored. */
export function scrubBankText(value: string): string {
  return value
    .replace(/\b\d{3}[-\s]\d{3}\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNicknameOnly(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/\d{3}[-\s]\d{3}/.test(trimmed)) return false;
  if (/\d{6,}/.test(trimmed)) return false;
  return true;
}
