import { cn } from "@/lib/cn";

export type MiniSignalLevel = "low" | "steady" | "moderate" | "tight" | "high";

type MiniSignalProps = {
  label: string;
  level: MiniSignalLevel;
  summary?: string;
  className?: string;
};

const LEVEL_STYLE: Record<MiniSignalLevel, { dot: string; text: string }> = {
  low: { dot: "bg-emerald-500", text: "text-zinc-600" },
  steady: { dot: "bg-zinc-400", text: "text-zinc-600" },
  moderate: { dot: "bg-amber-400", text: "text-zinc-700" },
  tight: { dot: "bg-orange-500", text: "text-zinc-800" },
  high: { dot: "bg-red-500", text: "text-zinc-800" },
};

export function MiniSignal({ label, level, summary, className }: MiniSignalProps) {
  const visual = LEVEL_STYLE[level];
  const levelText = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <div
      className={cn("rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2", className)}
      role="status"
      aria-label={`${label}: ${levelText}${summary ? `. ${summary}` : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", visual.dot)} aria-hidden />
          <span className="truncate text-xs font-medium text-zinc-800">{label}</span>
        </div>
        <span className={cn("shrink-0 text-xs", visual.text)}>{levelText}</span>
      </div>
      {summary ? <div className="mt-1 text-xs text-zinc-500">{summary}</div> : null}
    </div>
  );
}
