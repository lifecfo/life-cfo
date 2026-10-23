"use client";

export function PrintPackButton() {
  return (
    <button type="button" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm" onClick={() => window.print()}>
      Print
    </button>
  );
}
