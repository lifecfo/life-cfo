"use client";

export function PrintPackButton() {
  return (
    <button type="button" className="rounded-xl border border-neutral-border bg-neutral-surface px-3 py-2 text-sm text-neutral-text" onClick={() => window.print()}>
      Print
    </button>
  );
}
