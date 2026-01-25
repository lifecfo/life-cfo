// app/(app)/how-keystone-works/page.tsx
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

function Box({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-zinc-700">
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function Arrow() {
  return <div className="text-center text-xs text-zinc-400">↓</div>;
}

export default function HowKeystoneWorksPage() {
  return (
    <Page title="How it works" subtitle="A simple explanation you can trust.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Top summary */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Keystone is a calm decision system.</div>
              <div className="text-sm leading-relaxed text-zinc-700">
                You can unload what’s on your mind, shape it into a decision, and store it safely so it stops looping in your head.
                Keystone helps you return to the right things at the right time — quietly.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diagram */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-zinc-600">At a glance</div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="grid gap-3">
              <Box
                title="You"
                lines={[
                  "Capture thoughts, notes, receipts",
                  "Turn them into clear decisions",
                  "Choose what to save and what to ignore",
                ]}
              />
              <Arrow />
              <Box
                title="Keystone app"
                lines={[
                  "Shows simple pages (Capture → Framing → Thinking → Decisions → Revisit → Chapters)",
                  "Keeps the experience calm (no dashboards, no overwhelm)",
                ]}
              />
              <Arrow />
              <Box
                title="Your private data store (Supabase)"
                lines={[
                  "Stores your decisions, bills, accounts, attachments",
                  "Access is restricted to your signed-in user",
                  "Nothing is “shared” across users",
                ]}
              />
              <Arrow />
              <Box
                title="AI support (when you ask for it)"
                lines={[
                  "Helps you think, summarise, and clarify",
                  "Uses only the context needed for the request",
                  "Nothing is auto-committed — you stay in control",
                ]}
              />
            </div>
          </div>
        </div>

        {/* What happens on each page */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">What each step does</div>

              <div className="grid gap-2 text-sm text-zinc-700">
                <div>
                  <Chip className="mr-2 text-xs">Capture</Chip>
                  Get things out of your head quickly.
                </div>
                <div>
                  <Chip className="mr-2 text-xs">Framing</Chip>
                  Decide if it’s truly a decision; create a clean draft.
                </div>
                <div>
                  <Chip className="mr-2 text-xs">Thinking</Chip>
                  The safe workspace for analysis and options.
                </div>
                <div>
                  <Chip className="mr-2 text-xs">Decisions</Chip>
                  Your committed decisions and notes (protected memory).
                </div>
                <div>
                  <Chip className="mr-2 text-xs">Revisit</Chip>
                  Only what’s due, or due soon — nothing else.
                </div>
                <div>
                  <Chip className="mr-2 text-xs">Chapters</Chip>
                  Honoured and closed — still searchable, not nagging you.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trust + control (short) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Control and trust</div>
              <div className="text-sm leading-relaxed text-zinc-700">
                Keystone is designed to keep your data private, and to keep AI “assistive” — not in charge.
                A dedicated privacy page will explain the details, but the simple rule is:
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
                <span className="font-semibold">You decide</span> what gets saved, what gets analysed, and what becomes durable memory.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
