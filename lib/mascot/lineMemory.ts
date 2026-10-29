import { MASCOT_LINES } from "./lines";

const STORAGE_KEY = "lifecfo-mascot-line";
const STICKY_MS = 5 * 60 * 1000;

type StoredLine = { line: string; at: number };

function readStored(): StoredLine | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLine>;
    if (typeof parsed.line !== "string" || typeof parsed.at !== "number") return null;
    return { line: parsed.line, at: parsed.at };
  } catch {
    return null;
  }
}

function writeStored(value: StoredLine) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

function pickDifferentFrom(previous: string | null): string {
  const pool = previous ? MASCOT_LINES.filter((line) => line !== previous) : MASCOT_LINES;
  const source = pool.length > 0 ? pool : MASCOT_LINES;
  return source[Math.floor(Math.random() * source.length)];
}

/**
 * Returns the mascot's current line, picking a new one (never the same
 * as the last) only once 5 minutes have passed since it was last picked.
 * Persisted in localStorage so repeated hover/tap/focus and page changes
 * within the window see the same line.
 */
export function getStickyMascotLine(): string {
  const now = Date.now();
  const stored = readStored();

  if (stored && now - stored.at < STICKY_MS) {
    return stored.line;
  }

  const next = pickDifferentFrom(stored?.line ?? null);
  writeStored({ line: next, at: now });
  return next;
}
