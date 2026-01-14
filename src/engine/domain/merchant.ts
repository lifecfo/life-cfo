// src/engine/domain/merchant.ts

/**
 * Normalize a transaction description or merchant name
 * into a stable merchant_key the engine can reason about.
 */
export function normalizeMerchant(input: string): string {
  if (!input) return 'unknown';

  return input
    .toLowerCase()
    // remove digits
    .replace(/[0-9]/g, '')
    // remove punctuation & symbols
    .replace(/[^a-z\s]/g, '')
    // collapse multiple spaces
    .replace(/\s+/g, ' ')
    // trim
    .trim();
}
