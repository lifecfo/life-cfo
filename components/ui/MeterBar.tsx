import * as React from "react";
import { cn } from "@/lib/cn";

type MeterBarProps = {
  label: string;
  value: number;
  total: number;
  valueLabel?: string;
  totalLabel?: string;
  emptyLabel?: string;
  className?: string;
};

function toFiniteNumber(input: number): number {
  return Number.isFinite(input) ? input : 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function MeterBar({
  label,
  value,
  total,
  valueLabel,
  totalLabel,
  emptyLabel = "Not enough data yet.",
  className,
}: MeterBarProps) {
  const safeTotal = Math.max(0, toFiniteNumber(total));
  const safeValue = Math.max(0, toFiniteNumber(value));
  const clampedValue = safeTotal > 0 ? clamp(safeValue, 0, safeTotal) : 0;
  const ratio = safeTotal > 0 ? clampedValue / safeTotal : 0;
  const percent = Math.round(ratio * 100);
  const showFallback = safeTotal <= 0;
  const meterId = React.useId();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div id={meterId} className="text-xs font-medium text-zinc-700">
          {label}
        </div>
        <div className="text-xs text-zinc-500">
          {showFallback ? emptyLabel : `${percent}%`}
        </div>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-labelledby={meterId}
        aria-valuemin={0}
        aria-valuemax={showFallback ? 100 : safeTotal}
        aria-valuenow={showFallback ? 0 : clampedValue}
        aria-valuetext={
          showFallback
            ? `${label}: ${emptyLabel}`
            : `${label}: ${percent}%`
        }
      >
        <div
          className="h-full rounded-full bg-cfo"
          style={{ width: `${showFallback ? 0 : percent}%` }}
        />
      </div>

      {(valueLabel || totalLabel) && !showFallback ? (
        <div className="flex items-baseline justify-between gap-3 text-xs text-zinc-500">
          <span>{valueLabel || ""}</span>
          <span>{totalLabel || ""}</span>
        </div>
      ) : null}
    </div>
  );
}
