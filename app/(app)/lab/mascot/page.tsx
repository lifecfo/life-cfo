"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";
import { CatSvg, type CatExpression, type CatPose } from "@/components/mascot/CatSvg";
import { MouseSvg } from "@/components/mascot/MouseSvg";
import { MouseHoleSvg } from "@/components/mascot/MouseHoleSvg";
import { BoxSvg } from "@/components/mascot/BoxSvg";
import { CheeseSvg } from "@/components/mascot/CheeseSvg";

export const dynamic = "force-dynamic";

type PosePreview = {
  label: string;
  pose: CatPose;
  expression: CatExpression;
  earsUp?: boolean;
  note: string;
};

const POSES: PosePreview[] = [
  { label: "Sitting", pose: "sitting", expression: "open", note: "Default resting pose -- ambient idle, empty-state peek." },
  { label: "Walking", pose: "walking", expression: "open", note: "Legs alternate + body bobs while this class is applied." },
  { label: "Napping", pose: "sitting", expression: "sleepy", note: "Closed eyes, floating z, slow breathing scale on the body." },
  { label: "Alert", pose: "sitting", expression: "alert", earsUp: true, note: "Wider pupils + ears up -- used when the cat notices the mouse." },
  { label: "Happy", pose: "sitting", expression: "happy", note: "Upside-down-U eyes -- small-win celebration, paired with a tail wag." },
];

function PoseCard({ preview }: { preview: PosePreview }) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <div style={{ width: 120, height: 120, color: "#1F5E5C" }}>
          <CatSvg pose={preview.pose} expression={preview.expression} earsUp={preview.earsUp} style={{ width: "100%", height: "100%" }} />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-900">{preview.label}</div>
          <div className="mt-1 text-xs text-zinc-500">{preview.note}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MascotLabPage() {
  return (
    <Page title="Mascot preview" subtitle="Developer-only. Static poses, before wiring up the live animations.">
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 sm:px-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Cat poses</div>
            <div className="mt-1 text-xs text-zinc-500">
              Rendered at 120px here for review -- production size is 72px desktop / 64px mobile.
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {POSES.map((preview) => (
                <PoseCard key={preview.label} preview={preview} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Production size</div>
            <div className="mt-1 text-xs text-zinc-500">72px (desktop) and 64px (mobile), side by side.</div>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 72, height: 72 }}>
                  <CatSvg pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">72px</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 64, height: 64 }}>
                  <CatSvg pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">64px</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 26, height: 17 }}>
                  <MouseSvg style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Mouse, 26px wide</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Props</div>
            <div className="mt-1 text-xs text-zinc-500">Box, mouse hole, cheese -- shown at 2x for review.</div>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 64, height: 48 }}>
                  <BoxSvg style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Box</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 56, height: 40 }}>
                  <MouseHoleSvg style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Mouse hole</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 28, height: 20 }}>
                  <CheeseSvg style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Cheese</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
