"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";
import { CatSvg, type CatExpression, type CatPose } from "@/components/mascot/CatSvg";
import { BubbleShape } from "@/components/mascot/BubbleShape";
import { mascotHandwrittenFont } from "@/components/mascot/mascotFont";
import { MASCOT_MOUSE_ENABLED } from "@/lib/mascot/mouseFlag";

export const dynamic = "force-dynamic";

type PosePreview = {
  label: string;
  pose: CatPose;
  expression: CatExpression;
  earsUp?: boolean;
  note: string;
};

const POSES: PosePreview[] = [
  { label: "Sitting", pose: "sitting", expression: "open", note: "Default resting pose -- ambient idle, empty-state cat." },
  { label: "Walking", pose: "walking", expression: "open", note: "Legs alternate + body bobs while this class is applied." },
  { label: "Napping", pose: "sitting", expression: "sleepy", note: "Closed eyes, floating z, slow breathing scale on the body." },
  { label: "Alert", pose: "sitting", expression: "alert", earsUp: true, note: "Wider pupils + ears up -- reserved for mouse scenes (currently paused)." },
  { label: "Happy", pose: "sitting", expression: "happy", note: "Upside-down-U eyes -- small-win celebration, paired with a tail wag." },
];

function PoseCard({ preview }: { preview: PosePreview }) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <div style={{ width: 120, height: 120 }}>
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
    <Page title="Mascot preview" subtitle="Developer-only. Recoloured, resized, before judging the live placement.">
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 sm:px-6">
        {!MASCOT_MOUSE_ENABLED ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent>
              <div className="text-sm text-amber-900">
                The mouse (scenes, hole, cheese) is paused -- lib/mascot/mouseFlag.ts&apos;s MASCOT_MOUSE_ENABLED is
                false. The code is intact, just not rendered anywhere.
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Cat poses</div>
            <div className="mt-1 text-xs text-zinc-500">
              Rendered at 120px here (true to production desktop size) -- mobile is 96px.
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
            <div className="mt-1 text-xs text-zinc-500">120px (desktop) and 96px (mobile), side by side.</div>
            <div className="mt-4 flex flex-wrap items-end gap-8">
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvg pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">120px</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 96, height: 96 }}>
                  <CatSvg pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">96px</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Hand-drawn speech bubble</div>
            <div className="mt-1 text-xs text-zinc-500">
              Wobbly SVG outline (teal marker-pen stroke, cream fill), handwritten font, a sample line.
            </div>
            <div className="mt-10 flex items-end gap-10 pb-10">
              <div style={{ position: "relative", width: 230 }}>
                <div style={{ position: "relative", padding: "18px 20px 30px", fontSize: 16, lineHeight: 1.4, color: "#16413f" }}>
                  <BubbleShape tailSide="left" />
                  <span className={`${mascotHandwrittenFont.className}`} style={{ position: "relative", zIndex: 1, display: "block" }}>
                    Done is cosier than perfect.
                  </span>
                </div>
              </div>
              <div style={{ width: 120, height: 120 }}>
                <CatSvg pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
