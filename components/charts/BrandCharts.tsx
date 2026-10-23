"use client";

import { useState, type MouseEvent } from "react";

export type ChartSegment = {
  id: string;
  label: string;
  amountLabel: string;
  percent: number;
  swatchClass: string;
};

export type LineSeries = {
  id: string;
  label: string;
  values: number[];
  strokeClass: string;
  fillClass: string;
  swatchClass: string;
};

const CHART_WIDTH = 960;
const CHART_HEIGHT = 280;
const CHART_LEFT = 72;
const CHART_RIGHT = 16;
const CHART_TOP = 16;
const CHART_BOTTOM = 36;

export function ChartEmpty({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-border bg-neutral-bg px-4 py-6 text-sm text-neutral-text-2">
      {children}
    </div>
  );
}

export function ChartLegend({ items }: { items: { id: string; label: string; swatchClass: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-neutral-text-2">
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${item.swatchClass}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function SegmentedBar({ segments, empty }: { segments: ChartSegment[]; empty: string }) {
  const visible = segments.filter((segment) => segment.percent > 0);
  if (!visible.length) return <ChartEmpty>{empty}</ChartEmpty>;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-bg" role="img" aria-label={visible.map((segment) => `${segment.label} ${segment.amountLabel}`).join(", ")}>
        {visible.map((segment) => (
          <div
            key={segment.id}
            className={segment.swatchClass}
            style={{ width: `${segment.percent}%` }}
            title={`${segment.label}: ${segment.amountLabel}`}
          />
        ))}
      </div>
      <ChartLegend
        items={visible.map((segment) => ({
          id: segment.id,
          label: `${segment.label}: ${segment.amountLabel}`,
          swatchClass: segment.swatchClass,
        }))}
      />
    </div>
  );
}

export function ProgressMeter({ percent, label }: { percent: number; label?: string }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-bg" role="img" aria-label={label || `${Math.round(width)} percent`}>
      <div
        className="motion-fill h-full rounded-full bg-cfo"
        style={{ width: `${width}%`, ["--fill-target" as string]: `${width}%` }}
      />
    </div>
  );
}

function chartX(index: number, count: number): number {
  if (count <= 1) return CHART_LEFT;
  return CHART_LEFT + ((CHART_WIDTH - CHART_LEFT - CHART_RIGHT) * index) / (count - 1);
}

function chartY(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return (CHART_TOP + CHART_HEIGHT - CHART_BOTTOM) / 2;
  return CHART_TOP + ((max - value) / range) * (CHART_HEIGHT - CHART_TOP - CHART_BOTTOM);
}

export function LineChart({
  labels,
  series,
  formatValue,
  ariaLabel,
  empty,
}: {
  labels: string[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  empty: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const count = labels.length;
  const values = series.flatMap((item) => item.values);
  if (!count || !series.length || values.every((value) => value === 0)) {
    return <ChartEmpty>{empty}</ChartEmpty>;
  }
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const zeroY = chartY(0, min, max);
  const midY = chartY((min + max) / 2, min, max);

  function points(item: LineSeries): string {
    return item.values
      .map((value, index) => `${chartX(index, count)},${chartY(value, min, max)}`)
      .join(" ");
  }

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = ratio * CHART_WIDTH;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      const distance = Math.abs(chartX(index, count) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setActive(nearest);
  }

  const tip = active == null ? null : series.map((item) => ({
    id: item.id,
    label: item.label,
    value: formatValue(item.values[active] ?? 0),
    swatchClass: item.swatchClass,
  }));

  return (
    <div className="space-y-3">
      <ChartLegend items={series.map((item) => ({ id: item.id, label: item.label, swatchClass: item.swatchClass }))} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={ariaLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        >
          <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={CHART_TOP} y2={CHART_TOP} stroke="#DAD6CF" strokeWidth="1" />
          <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={midY} y2={midY} stroke="#DAD6CF" strokeWidth="1" />
          <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={zeroY} y2={zeroY} stroke="#DAD6CF" strokeDasharray="4 4" />
          {series.map((item) => (
            <polyline
              key={item.id}
              points={points(item)}
              fill="none"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              className={item.strokeClass}
            />
          ))}
          {labels.map((label, index) => {
            const x = chartX(index, count);
            return (
              <g key={`${label}-${index}`}>
                {series.map((item) => (
                  <circle
                    key={item.id}
                    cx={x}
                    cy={chartY(item.values[index] ?? 0, min, max)}
                    r={active === index ? 6 : 4}
                    className={item.fillClass}
                  />
                ))}
                <text x={x} y={CHART_HEIGHT - 12} textAnchor="middle" className="fill-neutral-text-2 text-[11px]">
                  {label}
                </text>
              </g>
            );
          })}
          <text x={CHART_LEFT - 8} y={CHART_TOP + 4} textAnchor="end" className="fill-neutral-text-2 text-[11px]">
            {formatValue(max)}
          </text>
          <text x={CHART_LEFT - 8} y={zeroY + 4} textAnchor="end" className="fill-neutral-text-2 text-[11px]">
            {formatValue(0)}
          </text>
          {min < 0 ? (
            <text x={CHART_LEFT - 8} y={CHART_HEIGHT - CHART_BOTTOM} textAnchor="end" className="fill-neutral-text-2 text-[11px]">
              {formatValue(min)}
            </text>
          ) : null}
        </svg>
        {tip && active != null ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-neutral-border bg-neutral-surface px-3 py-2 text-xs text-neutral-text shadow-sm">
            <div className="font-medium">{labels[active]}</div>
            {tip.map((row) => (
              <div key={row.id} className="mt-1 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${row.swatchClass}`} />
                {row.label}: {row.value}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
