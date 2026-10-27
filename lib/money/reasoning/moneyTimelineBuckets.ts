// Calendar-aligned bucket builder for the zoomable timeline
// (deriveZoomTimeline.ts). Bucket boundaries are fixed calendar periods
// (ISO week, calendar month/quarter/year) independent of any individual
// recurring item's own cadence -- the same idea deriveYearMoneySummary.ts
// already uses (occurrences get assigned into calendar-month buckets by
// date, not matched to the bucket by cadence), just generalized to more
// granularities.
import type { TimelineBucket, TimelineGranularity } from "./types";

export const DEFAULT_BUCKET_SPAN: Record<TimelineGranularity, { past: number; future: number }> = {
  week: { past: 6, future: 6 },
  month: { past: 6, future: 6 },
  quarter: { past: 6, future: 6 },
  year: { past: 3, future: 3 },
};

function startOfWeekUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function periodStart(date: Date, granularity: TimelineGranularity): Date {
  switch (granularity) {
    case "week":
      return startOfWeekUTC(date);
    case "month":
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    case "quarter": {
      const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
      return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
    }
    case "year":
      return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }
}

function addPeriod(date: Date, granularity: TimelineGranularity, count: number): Date {
  switch (granularity) {
    case "week": {
      const d = new Date(date);
      d.setUTCDate(d.getUTCDate() + 7 * count);
      return d;
    }
    case "month":
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
    case "quarter":
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count * 3, 1));
    case "year":
      return new Date(Date.UTC(date.getUTCFullYear() + count, 0, 1));
  }
}

// ISO 8601 week number (Monday-start weeks, week 1 contains the year's
// first Thursday). `start` must already be a week's Monday.
function isoWeekNumber(start: Date): { isoYear: number; week: number } {
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear: thursday.getUTCFullYear(), week };
}

function bucketKey(start: Date, granularity: TimelineGranularity): string {
  switch (granularity) {
    case "week": {
      const { isoYear, week } = isoWeekNumber(start);
      return `${isoYear}-W${String(week).padStart(2, "0")}`;
    }
    case "month":
      return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    case "quarter":
      return `${start.getUTCFullYear()}-Q${Math.floor(start.getUTCMonth() / 3) + 1}`;
    case "year":
      return String(start.getUTCFullYear());
  }
}

function bucketLabel(start: Date, granularity: TimelineGranularity): string {
  switch (granularity) {
    case "week":
      return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(start);
    case "month":
      return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }).format(start);
    case "quarter":
      return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
    case "year":
      return String(start.getUTCFullYear());
  }
}

export function buildTimelineBuckets(
  granularity: TimelineGranularity,
  nowIso: string,
  pastCount: number,
  futureCount: number
): TimelineBucket[] {
  const parsedNow = Date.parse(nowIso);
  const now = Number.isFinite(parsedNow) ? new Date(parsedNow) : new Date();
  const currentStart = periodStart(now, granularity);
  const nowMs = now.getTime();

  const buckets: TimelineBucket[] = [];
  for (let offset = -pastCount; offset <= futureCount; offset += 1) {
    const start = addPeriod(currentStart, granularity, offset);
    const end = addPeriod(start, granularity, 1);
    const startMs = start.getTime();
    const endMs = end.getTime();
    buckets.push({
      key: bucketKey(start, granularity),
      label: bucketLabel(start, granularity),
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      is_past: endMs <= nowMs,
      is_current: startMs <= nowMs && nowMs < endMs,
    });
  }
  return buckets;
}
