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
  splitIndex,
  onPointClick,
  maxLabels,
}: {
  labels: string[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  empty: string;
  /** Index at/after which each series renders dashed instead of solid (e.g. the "today" point). */
  splitIndex?: number;
  /** Called with a point's index when its dot is clicked. */
  onPointClick?: (index: number) => void;
  /** Thins rendered x-axis text labels to roughly this many (always keeps the last). Point dots are unaffected. */
  maxLabels?: number;
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
  const hasSplit = typeof splitIndex === "number" && splitIndex > 0 && splitIndex < count - 1;
  const labelStep = maxLabels && maxLabels > 0 ? Math.max(1, Math.ceil(count / maxLabels)) : 1;

  function points(item: LineSeries, fromIndex: number, toIndex: number): string {
    const slice: string[] = [];
    for (let index = fromIndex; index <= toIndex; index += 1) {
      slice.push(`${chartX(index, count)},${chartY(item.values[index] ?? 0, min, max)}`);
    }
    return slice.join(" ");
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
          {hasSplit ? (
            <>
              <line
                x1={chartX(splitIndex as number, count)}
                x2={chartX(splitIndex as number, count)}
                y1={CHART_TOP}
                y2={CHART_HEIGHT - CHART_BOTTOM}
                stroke="#B7B1A6"
                strokeDasharray="3 3"
              />
              <text
                x={chartX(splitIndex as number, count)}
                y={CHART_TOP - 2}
                textAnchor="middle"
                className="fill-neutral-text-2 text-[10px]"
              >
                Today
              </text>
            </>
          ) : null}
          {series.map((item) =>
            hasSplit ? (
              <g key={item.id}>
                <polyline
                  points={points(item, 0, splitIndex as number)}
                  fill="none"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={item.strokeClass}
                />
                <polyline
                  points={points(item, splitIndex as number, count - 1)}
                  fill="none"
                  strokeWidth="3"
                  strokeDasharray="6 5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={item.strokeClass}
                />
              </g>
            ) : (
              <polyline
                key={item.id}
                points={points(item, 0, count - 1)}
                fill="none"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                className={item.strokeClass}
              />
            )
          )}
          {labels.map((label, index) => {
            const x = chartX(index, count);
            const showLabel = index % labelStep === 0 || index === count - 1;
            return (
              <g key={`${label}-${index}`}>
                {series.map((item) => (
                  <g key={item.id}>
                    <circle
                      cx={x}
                      cy={chartY(item.values[index] ?? 0, min, max)}
                      r={active === index ? 6 : 4}
                      className={item.fillClass}
                    />
                    {onPointClick ? (
                      <circle
                        cx={x}
                        cy={chartY(item.values[index] ?? 0, min, max)}
                        r={12}
                        fill="transparent"
                        className="cursor-pointer"
                        onClick={() => onPointClick(index)}
                      />
                    ) : null}
                  </g>
                ))}
                {showLabel ? (
                  <text x={x} y={CHART_HEIGHT - 12} textAnchor="middle" className="fill-neutral-text-2 text-[11px]">
                    {label}
                  </text>
                ) : null}
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

/**
 * A single-series bar chart, same visual language and layout constants
 * as LineChart above (hover tooltip, AUD-ready via formatValue). Bars
 * never go negative here -- What if?'s projected totals are always
 * >= the starting amount.
 */
export function BarChart({
  labels,
  values,
  formatValue,
  ariaLabel,
  empty,
  swatchClass = "fill-cfo",
  maxLabels,
}: {
  labels: string[];
  values: number[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  empty: string;
  swatchClass?: string;
  /** Thins rendered x-axis text labels to roughly this many (always keeps the last). Bars are unaffected. */
  maxLabels?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const count = labels.length;
  if (!count || !values.length || values.every((value) => value === 0)) {
    return <ChartEmpty>{empty}</ChartEmpty>;
  }
  const labelStep = maxLabels && maxLabels > 0 ? Math.max(1, Math.ceil(count / maxLabels)) : 1;

  const max = Math.max(0, ...values);
  const plotLeft = CHART_LEFT;
  const plotRight = CHART_WIDTH - CHART_RIGHT;
  const plotTop = CHART_TOP;
  const plotBottom = CHART_HEIGHT - CHART_BOTTOM;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const slot = plotWidth / count;
  const barWidth = Math.max(4, slot * 0.6);

  function barX(index: number): number {
    return plotLeft + slot * index + (slot - barWidth) / 2;
  }

  function barHeight(value: number): number {
    if (max <= 0) return 0;
    return (value / max) * plotHeight;
  }

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = ratio * CHART_WIDTH;
    const index = Math.min(count - 1, Math.max(0, Math.floor((x - plotLeft) / slot)));
    setActive(index);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={ariaLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        >
          <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="#DAD6CF" strokeWidth="1" />
          {values.map((value, index) => {
            const h = barHeight(value);
            return (
              <rect
                key={`${labels[index]}-${index}`}
                x={barX(index)}
                y={plotBottom - h}
                width={barWidth}
                height={Math.max(0, h)}
                rx={3}
                className={swatchClass}
                opacity={active === index ? 1 : 0.85}
              />
            );
          })}
          {labels.map((label, index) => {
            const showLabel = index % labelStep === 0 || index === count - 1;
            if (!showLabel) return null;
            return (
              <text
                key={`${label}-${index}`}
                x={barX(index) + barWidth / 2}
                y={CHART_HEIGHT - 12}
                textAnchor="middle"
                className="fill-neutral-text-2 text-[11px]"
              >
                {label}
              </text>
            );
          })}
          <text x={plotLeft - 8} y={plotTop + 4} textAnchor="end" className="fill-neutral-text-2 text-[11px]">
            {formatValue(max)}
          </text>
          <text x={plotLeft - 8} y={plotBottom} textAnchor="end" className="fill-neutral-text-2 text-[11px]">
            {formatValue(0)}
          </text>
        </svg>
        {active != null ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-neutral-border bg-neutral-surface px-3 py-2 text-xs text-neutral-text shadow-sm">
            <div className="font-medium">{labels[active]}</div>
            <div className="mt-1">{formatValue(values[active] ?? 0)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
