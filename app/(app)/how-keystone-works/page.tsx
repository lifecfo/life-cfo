"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";

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
          <div className="mt-1 text-sm text-zinc-700">Unload what’s on your mind. Get a calm sense of what matters.</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Decisions</div>
          <div className="mt-1 text-sm text-zinc-700">Capture → Framing → Thinking → Decisions → Review → Chapters</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Money</div>
          <div className="mt-1 text-sm text-zinc-700">Structured inputs that support clear decisions over time.</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Outcome</div>
          <div className="mt-1 text-sm text-zinc-700">You feel lighter because the right things are safely held.</div>
        </div>
      </div>
    </div>
  );
}

export default function HowKeystoneWorksPage() {
  return (
    <Page title="How it works" subtitle="A simple map of what Keystone does (and what it avoids).">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">The point</div>
              <div className="text-sm leading-relaxed text-zinc-700">
                Keystone helps you stop carrying mental loops by holding decisions safely — then bringing things back only when they’re due.
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
                Keystone’s job is to help you close the app feeling <span className="font-semibold">lighter</span>.
              </div>
            </div>
          </CardContent>
        </Card>

        <Diagram />

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">What you’ll do</div>

              <div className="grid gap-3">
                <Step
                  title="1) Get it out of your head"
                  body="Start on Home. Write what’s on your mind — a worry, a decision, a loose end. Keystone is built for unloading first."
                />
                <Step
                  title="2) Make the decision clear"
                  body="Capture holds raw inputs. Framing turns them into a clear, neutral decision statement you can work with."
                />
                <Step
                  title="3) Think safely, then commit"
                  body="Thinking is a safe workspace for options and reasoning. Decisions is where you record what you decided (only when you choose to)."
                />
                <Step
                  title="4) Bring it back only when needed"
                  body="Review shows only what’s due or due soon. No backlogs, no noise. Chapters holds what you’ve honoured and closed."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Rules you can rely on</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>No auto-decisions. You stay in control.</li>
                <li>AI never commits anything on its own.</li>
                <li>Review is intentionally limited to what’s due (no backlogs).</li>
                <li>Keystone avoids pressure, urgency, and “productivity guilt”.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is not</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>A dashboard app.</li>
                <li>A to-do list that collects backlogs.</li>
                <li>An AI that makes decisions for you.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
