// app/(app)/fine-print/FinePrintReadOnly.tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, Chip } from "@/components/ui";

function formatWhen(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function FinePrintReadOnly({
  signedName,
  signedAt,
  version,
}: {
  signedName: string;
  signedAt: string;
  version: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {/* Receipt */}
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Fine print accepted</div>
              <div className="text-sm text-zinc-700">
                You’ve already reviewed and accepted Keystone’s boundaries.
              </div>
            </div>

            <div className="grid gap-2 text-sm text-zinc-700">
              <div>
                <span className="font-medium text-zinc-900">Signed by:</span>{" "}
                {signedName || "—"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Date:</span>{" "}
                {formatWhen(signedAt)}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Version:</span>{" "}
                {version || "—"}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
              <Chip onClick={() => router.push("/settings")}>Settings</Chip>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full fine print text (read-only) */}
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-6">
            {/* What it is */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                What Keystone is
              </div>
              <div className="text-sm text-zinc-700">
                Keystone is a calm place to hold decisions and inputs so you can
                see life more clearly and stop carrying mental loops.
              </div>
              <div className="text-sm text-zinc-700">
                It’s built for orientation and repeatable good decisions — not
                dashboards, not hustle.
              </div>
            </div>

            {/* What it is not */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                What Keystone is not
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                <li>Not financial, legal, medical, or tax advice.</li>
                <li>Not a forecast or guarantee.</li>
                <li>Not accounting software.</li>
                <li>Not a replacement for professional help when you need it.</li>
              </ul>
            </div>

            {/* AI boundaries */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                AI boundaries
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                <li>AI helps when you ask.</li>
                <li>No auto-decisions. No auto-saving.</li>
                <li>
                  Summaries are preview-first, then explicitly attached by you.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
