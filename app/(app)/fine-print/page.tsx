// app/(app)/fine-print/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function FinePrintPage() {
  const router = useRouter();

  return (
    <Page
      title="Fine print"
      subtitle="Plain-language boundaries. Trust comes from clarity."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => router.push("/how-keystone-works")}>How it works</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is</div>
              <div className="text-sm text-zinc-700">
                Keystone is a calm place to hold decisions and inputs so you can see life more clearly and stop carrying mental loops.
              </div>
              <div className="text-sm text-zinc-700">
                It’s built for orientation and repeatable good decisions — not dashboards, not hustle.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is not</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Not financial, legal, medical, or tax advice.</li>
                <li>Not a forecast or guarantee.</li>
                <li>Not accounting software.</li>
                <li>Not a replacement for professional help when you need it.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Money pages: “picture”, not precision</div>
              <div className="text-sm text-zinc-700">
                Accounts, Bills, Income, Investments, Budget and Transactions are inputs that Keystone converts into a simple monthly picture.
                The goal is clarity — not perfect accuracy.
              </div>
              <div className="text-sm text-zinc-700">
                If something looks off, treat it as a prompt to check your inputs — not a truth statement.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">AI boundaries (V1 posture)</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Keystone should speak sparingly: to ground, reflect, and clarify.</li>
                <li>Chats do not auto-commit into durable memory without your explicit action.</li>
                <li>Summaries are user-invited: preview first, then explicitly attach to a decision if you choose.</li>
                <li>“Engine” style automation should stay background; no urgent or pressuring language.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Your control</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>You decide what gets saved.</li>
                <li>You decide what gets revisited.</li>
                <li>You can keep things rough and incomplete — it still helps.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Privacy & safety (simple statement)</div>
              <div className="text-sm text-zinc-700">
                Keystone is designed to minimize cognitive load and avoid manipulative patterns. If anything feels noisy, it’s a bug.
              </div>
              <div className="text-sm text-zinc-700">
                (We can add a fuller Privacy page later. For V1 this is the “trust posture” page.)
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="pt-1">
          <Chip onClick={() => router.push("/home")}>Done</Chip>
        </div>
      </div>
    </Page>
  );
}
