// app/(app)/how-it-works/page.tsx
"use client";

import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-700">{body}</div>
    </div>
  );
}

function Diagram() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-semibold text-zinc-600">A simple map</div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Home</div>
          <div className="mt-1 text-sm text-zinc-700">
            Arrive, unload, or ask. Keystone surfaces what matters right now and ignores the rest.
          </div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Lifecycle</div>
          <div className="mt-1 text-sm text-zinc-700">Capture → Thinking → Decisions → Review → Chapters</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Money</div>
          <div className="mt-1 text-sm text-zinc-700">Accounts, bills, and goals quietly inform better decisions.</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Outcome</div>
          <div className="mt-1 text-sm text-zinc-700">
            Decisions feel clearer because the right information is connected and available.
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-1 text-sm text-zinc-900">{value}</div>
    </div>
  );
}

export default function HowKeystoneWorksPage() {
  return (
    <Page title="How it works" subtitle="A clear picture of what Keystone does — and how it’s designed to feel.">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        {/* PURPOSE */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2 min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Keystone’s purpose</div>
                <div className="text-sm leading-relaxed text-zinc-700">Keystone is a calm decision system.</div>
                <div className="text-sm leading-relaxed text-zinc-700">
                  It brings together your information — money, decisions, notes, and context — with AI that helps you
                  understand what’s going on, answer questions about your life, and make informed choices.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Calm</Chip>
                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Connected</Chip>
                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Grounded</Chip>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
              Keystone’s job is not to push you to act.
              <br />
              It’s to make sure the right information is available, connected, and understandable — so decisions feel
              clearer and lighter.
            </div>

            {/* visual balance */}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniKpi label="Starts with" value="Home" />
              <MiniKpi label="Holds" value="Decisions + Money context" />
              <MiniKpi label="Resurfaces" value="Only what’s relevant" />
            </div>
          </CardContent>
        </Card>

        {/* DIAGRAM */}
        <Diagram />

        {/* WHAT IT DOES */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">What Keystone actually does</div>

              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Gets things out of your head safely</li>
                <li>Shows how different parts of your life connect</li>
                <li>Lets you ask questions about your own data</li>
                <li>Supports decisions with context instead of guesswork</li>
                <li>Brings things back only when they’re relevant again</li>
              </ul>

              <div className="text-sm text-zinc-700">Keystone is designed to reduce noise, not add to it.</div>
            </div>
          </CardContent>
        </Card>

        {/* HOME */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Home</div>

              <div className="text-sm leading-relaxed text-zinc-700">Home shows you what matters right now.</div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700">
                You can unload something or ask a question. Keystone checks your decisions, money, and timing to surface
                what’s relevant — and ignores the rest.
              </div>

              <div className="text-sm leading-relaxed text-zinc-700">
                Home is intentionally minimal so you don’t carry more than you need to.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LIFECYCLE */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">The lifecycle</div>
              <div className="text-sm text-zinc-700">
                Keystone has a simple lifecycle you can move through when something matters. You don’t have to follow it
                step by step — and you can move backwards as easily as forwards.
              </div>

              <div className="grid gap-3">
                <Step title="Capture" body="Get something out of your head and into Keystone — a thought, concern, reminder, or file." />
                <Step title="Thinking" body="A safe workspace to explore options, trade-offs, and questions. Nothing is committed here." />
                <Step title="Decisions" body="When you’re ready, record what you decided — in your own words, with your reasoning." />
                <Step title="Review" body="Decisions resurface intentionally. You can act, think more, revise the decision, or move it on." />
                <Step title="Chapters" body="When something is complete, it can be honoured and released — still searchable, no longer open." />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MONEY */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Money’s role</div>
              <div className="text-sm leading-relaxed text-zinc-700">Money is a context layer.</div>
              <div className="text-sm leading-relaxed text-zinc-700">
                Accounts, bills, income, goals, and balances exist to inform better decisions — not to become another
                system you have to manage.
              </div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Answer questions accurately</li>
                <li>Ground decisions in reality</li>
                <li>Avoid guesswork and assumptions</li>
              </ul>
              <div className="text-sm text-zinc-700">Money supports decisions. It does not compete with them.</div>
            </div>
          </CardContent>
        </Card>

        {/* SECURITY */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Security & data trust</div>

              <div className="text-sm text-zinc-700">
                Your data is private and account-scoped. Every table is protected so records are only readable and
                writable within your identity.
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm font-semibold text-zinc-900">Controlled access by design</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 space-y-1">
                  <li>Records are filtered by your identity</li>
                  <li>Actions can only affect rows you own</li>
                  <li>Unauthorised reads or writes are blocked by default</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-sm font-semibold text-zinc-900">How AI uses your data</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-700">
                  AI is read-only by default. It can read your data to answer questions and connect decisions, money,
                  and timing — but it cannot write, commit, or change records.
                </div>
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 space-y-1">
                  <li>Nothing is saved unless you explicitly choose to save it</li>
                  <li>Exploration stays separate from permanent records</li>
                </ul>
              </div>

              <div className="text-sm text-zinc-700">
                Keystone avoids background automation and silent changes. This is a deliberate safety choice.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* WHAT IT IS NOT */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is not</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>A dashboard app</li>
                <li>A to-do list that accumulates backlogs</li>
                <li>An AI that tells you what to do</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
