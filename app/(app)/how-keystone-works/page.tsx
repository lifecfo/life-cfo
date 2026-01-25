// app/(app)/how-keystone-works/page.tsx
"use client";

import { useRouter } from "next/navigation";
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
      <div className="mt-2 space-y-1">
        {lines.map((t, i) => (
          <div key={i} className="text-sm text-zinc-700">
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

export default function HowKeystoneWorksPage() {
  const router = useRouter();

  return (
    <Page
      title="How Keystone works"
      subtitle="A simple explanation of what’s saved, what’s private, and what AI can (and can’t) do."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* 1) Diagram */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-zinc-900">The flow (at a glance)</div>
              <div className="text-sm text-zinc-600">
                Keystone is designed to reduce mental load. It stores your information safely, and only uses AI when it helps you think — never to take action on your behalf.
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="grid gap-3">
                  <Box
                    title="You"
                    lines={[
                      "Capture what’s on your mind.",
                      "Shape it into a decision when needed.",
                      "Choose what becomes “saved memory”.",
                    ]}
                  />
                  <Arrow label="saved to your account" />
                  <Box
                    title="Keystone database (Supabase)"
                    lines={[
                      "Decisions, notes, schedules, domains/constellations.",
                      "Bills & accounts you enter (V1).",
                      "Attachments you upload (stored privately).",
                    ]}
                  />
                  <Arrow label="AI reads only what’s needed for this screen" />
                  <Box
                    title="AI assistance (Thinking / conversation)"
                    lines={[
                      "Helps you explore options, tradeoffs, and next steps.",
                      "Suggests wording and structure.",
                      "Never commits decisions automatically.",
                    ]}
                  />
                  <Arrow label="you choose what happens next" />
                  <Box
                    title="You again"
                    lines={[
                      "You approve changes.",
                      "You decide what to record.",
                      "You decide what gets scheduled or closed.",
                    ]}
                  />
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                Nothing is auto-committed. Keystone can suggest, but only you can confirm.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2) What we store */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">What Keystone stores</div>

              <div className="grid gap-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Your decisions</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Titles, context, your notes, and any review dates you set (Revisit).
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Your structure (meaning)</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Domains and constellations are just labels you control — they help you find and group things.
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Attachments you upload</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Stored privately. When you open one, Keystone generates a short-lived secure link.
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Finance inputs (V1)</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Bills and accounts you manually enter. Keystone uses them to show calm orientation signals (like upcoming bills).
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3) AI boundaries */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">What AI can and can’t do</div>

              <div className="grid gap-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">AI can</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Help you think clearly. Summarise. Offer options. Suggest wording. Surface tradeoffs and constraints.
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">AI cannot</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Make decisions for you, move money, pay bills, contact others, or change your saved records without your approval.
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Nothing is auto-saved as “memory”</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    Keystone can draft and suggest — but anything durable (a “Decision”, a “Chapter”, a review schedule) happens only when you choose it.
                  </div>
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                Keystone is designed to feel safe: calm suggestions, explicit user consent, and no hidden automation.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4) Privacy tone (plain language) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Privacy (plain language)</div>

              <div className="space-y-2 text-sm text-zinc-700">
                <div>
                  • Your Keystone data is tied to your account and protected by access rules (so other users can’t see it).
                </div>
                <div>
                  • Keystone only loads the minimum it needs to show the current screen.
                </div>
                <div>
                  • Attachments open via short-lived secure links (not public URLs).
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                This page is a trust explainer — not legal terms. (Later we can add a proper Privacy Policy + Security page.)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => router.push("/capture")}>Capture something</Chip>
          <Chip onClick={() => router.push("/framing")}>Frame a decision</Chip>
        </div>
      </div>
    </Page>
  );
}
