// components/TilesRow.tsx
"use client";

import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

type TileItem = {
  id: string;
  name: string;
  emoji?: string | null;
};

function safeEmoji(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  // Keep it simple: allow 1–4 chars (covers most emoji sequences; still safe).
  if (!s) return "";
  if (s.length > 6) return ""; // avoid weird long strings
  return s;
}

export function TilesRow<T extends TileItem>({
  title,
  items,
  activeId,
  onSelect,
  className,
  allLabel = "All",
}: {
  title?: string;
  items: T[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
  allLabel?: string;
}) {
  if (!items.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {title ? <div className="text-xs text-zinc-500">{title}</div> : null}

      <div className="flex flex-wrap gap-2">
        <Chip active={activeId === null} onClick={() => onSelect(null)}>
          {allLabel}
        </Chip>

        {items.map((it) => {
          const em = safeEmoji(it.emoji);

          return (
            <Chip key={it.id} active={activeId === it.id} onClick={() => onSelect(it.id)}>
              <span className="inline-flex items-center gap-2">
                {em ? <span aria-hidden className="text-sm leading-none">{em}</span> : null}
                <span className="leading-none">{it.name}</span>
              </span>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
