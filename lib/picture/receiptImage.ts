export const RECEIPT_BUCKET = "household-receipts";
export const RECEIPT_MAX_EDGE_PX = 1600;
export const RECEIPT_JPEG_QUALITY = 0.8;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECEIPT_PATH = new RegExp(`^${UUID}/${UUID}\\.jpg$`, "i");

export function receiptPixelSize(
  width: number,
  height: number,
  maxEdge = RECEIPT_MAX_EDGE_PX
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("That photo could not be prepared.");
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isReceiptStoragePath(path: string): boolean {
  return RECEIPT_PATH.test(path);
}

export function isReceiptPathForHousehold(path: string, householdId: string): boolean {
  return isReceiptStoragePath(path) && path.toLowerCase().startsWith(`${householdId.toLowerCase()}/`);
}

/** Row paths plus file names listed in that household's storage folder. */
export function collectReceiptPaths(
  householdId: string,
  rowPaths: readonly (string | null | undefined)[],
  fileNames: readonly string[]
): string[] {
  const paths = new Set<string>();
  for (const path of rowPaths) {
    if (typeof path === "string" && isReceiptPathForHousehold(path, householdId)) paths.add(path);
  }
  for (const name of fileNames) {
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) continue;
    const path = `${householdId}/${name}`;
    if (isReceiptStoragePath(path)) paths.add(path);
  }
  return [...paths];
}
