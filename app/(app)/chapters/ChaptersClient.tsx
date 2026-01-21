// app/(app)/chapters/ChaptersClient.tsx
"use client";

import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function ChaptersClient() {
  const router = useRouter();

  return (
    <Page
      title="Chapters"
      subtitle="Honoured and closed. No action needed."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-3">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Nothing here yet.</div>
              <div className="text-sm text-zinc-600">
                When a season of life is complete, we’ll honour it here with a quiet summary and key decisions.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
