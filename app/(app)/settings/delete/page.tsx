// app/(app)/settings/delete/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DeleteAccountPage() {
  const router = useRouter();

  return (
    <Page
      title="Delete account"
      subtitle="Account deletion is handled with support during private beta."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/settings")}>Back to Settings</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">
                Account deletion is handled with support during private beta.
              </div>
              <div className="text-sm text-zinc-700">
                This helps us make sure shared household information and bank connections are handled safely.
              </div>
              <a
                className="inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href="mailto:admin@life-cfo.com?subject=Life%20CFO%20account%20deletion%20request"
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
