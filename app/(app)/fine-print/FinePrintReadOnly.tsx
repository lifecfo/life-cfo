// app/(app)/fine-print/FinePrintReadOnly.tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, Chip } from "@/components/ui";
import ImportantInformationContent from "./ImportantInformationContent";

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
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                Important information accepted
              </div>
              <div className="text-sm text-zinc-700">
                You’ve already reviewed and accepted this information.
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

      <ImportantInformationContent />
    </div>
  );
}
