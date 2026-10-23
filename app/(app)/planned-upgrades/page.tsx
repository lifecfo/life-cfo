// app/(app)/planned-upgrades/page.tsx
"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";

export const dynamic = "force-dynamic";

function Section({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: string[];
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {subtitle ? <div className="text-sm text-zinc-600">{subtitle}</div> : null}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function PlannedUpgradesPage() {
  return (
    <Page
      title="Planned upgrades"
      subtitle="What’s already intended for later versions — so feedback can focus on what matters in V1."
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2">
            <div className="text-sm text-zinc-700">
              Life CFO V1 is intentionally simple: hold decisions safely, reduce mental loops, and bring things back only when needed.
            </div>
            <div className="text-sm text-zinc-600">
              The items below are included so testers don’t spend time requesting features that are already planned for later.
            </div>
          </CardContent>
        </Card>

        <Section
          title="Planned next (post-V1)"
          subtitle="High confidence. These are already part of the intended direction."
          items={[
            "More automation of Money inputs (less manual entry over time).",
          ]}
        />

        <Section
          title="Later (directional)"
          subtitle="Part of the Life CFO shape, but timing depends on what we learn from V1 testers."
          items={[
            "Deeper decision constellations (better linking, related decisions, and recall).",
            "More meaning-layer tools (stronger Domains/Groups organisation and browsing).",
            "Money intelligence upgrades (safe planning surfaces; optional, never overwhelming).",
            "A more complete family context layer to support better decision reasoning over time.",
          ]}
        />

        <Section
          title="Intentionally not Life CFO"
          subtitle="These are explicitly out of scope because they increase pressure or noise."
          items={[
            "Dashboards, counters, streaks, or productivity gamification.",
            "Urgency language designed to create pressure.",
            "Auto-committing AI outputs into your decisions without your explicit consent.",
          ]}
        />

        <Card>
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">What feedback helps most</div>
            <div className="text-sm text-zinc-700">
              Tell us what felt lighter, what felt heavy, what confused you, and what you wished Life CFO held for you.
            </div>
            <div className="text-sm text-zinc-600">
              If your feedback is “I want X”, adding “so that I can feel Y” makes it actionable.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
