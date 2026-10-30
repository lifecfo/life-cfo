"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";
import { CatSvg } from "@/components/mascot/CatSvg";
import { CatSvgCartoon } from "@/components/mascot/CatSvgCartoon";
import { BubbleShape } from "@/components/mascot/BubbleShape";
import {
  ILLUSTRATED_POSE_VIEWBOX,
  ILLUSTRATED_POSES,
  ILLUSTRATED_REF_HEIGHT,
  IllustratedCat,
  type IllustratedPose,
} from "@/components/mascot/IllustratedCat";
import { mascotHandwrittenFont } from "@/components/mascot/mascotFont";
import { MASCOT_MOUSE_ENABLED } from "@/lib/mascot/mouseFlag";

export const dynamic = "force-dynamic";

/** Desktop production height. Phone size is 120px, the same scale. */
const PRODUCTION_HEIGHT = 160;

const POSE_COPY: Record<IllustratedPose, { label: string; note: string }> = {
  content: { label: "Content", note: "Default. Sitting, looking aside." },
  alert: { label: "Alert", note: "Hover, tap, or focus. Facing you." },
  happy: { label: "Happy", note: "Eyes closed, smiling." },
  curious: { label: "Curious", note: "Head tilted, looking up." },
  dozing: { label: "Dozing", note: "Eyes closed, head lowered." },
  grooming: { label: "Grooming", note: "Licking a paw." },
  lookingback: { label: "Looking back", note: "Glancing over the shoulder." },
  lying: { label: "Lying", note: "Loaf. Same scale, wider frame." },
  stretch: { label: "Stretch", note: "Play-bow. Same scale, wider frame." },
  walking: { label: "Walking", note: "Same scale, wider frame." },
};

function productionHeight(pose: IllustratedPose): number {
  return Math.round((PRODUCTION_HEIGHT * ILLUSTRATED_POSE_VIEWBOX[pose].h) / ILLUSTRATED_REF_HEIGHT);
}

function BubbleDemo({ side }: { side: "left" | "right" }) {
  const bubble = (
    <div className="mascot-bubble-slot" data-shown="true" style={{ width: 190 }}>
      <BubbleShape tailSide={side} />
      <span className={`mascot-bubble-text ${mascotHandwrittenFont.className}`}>Done is cosier than perfect.</span>
    </div>
  );
  const cat = <IllustratedCat pose="content" height={PRODUCTION_HEIGHT} />;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mascot-bubble-row">
        {side === "left" ? bubble : null}
        {cat}
        {side === "right" ? bubble : null}
      </div>
      <div className="text-xs text-zinc-500">
        Bubble on the {side}, tail pointing {side === "left" ? "right" : "left"} at the cat
      </div>
    </div>
  );
}

export default function MascotLabPage() {
  return (
    <Page title="Mascot preview" subtitle="Developer-only. Illustrated cat, hand-drawn bubble.">
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
            <div className="text-sm font-semibold text-zinc-900">Illustrated poses</div>
            <div className="mt-1 text-xs text-zinc-500">
              Desktop production size: the sitting cat is 160px tall (120px on a phone). Wider poses keep that scale
              and share the ground line. Paws line up along the bottom.
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-8">
              {ILLUSTRATED_POSES.map((pose) => (
                <div key={pose} className="flex min-w-[7.5rem] flex-col items-center gap-2 text-center">
                  <IllustratedCat pose={pose} height={productionHeight(pose)} />
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{POSE_COPY[pose].label}</div>
                    <div className="mt-1 text-xs text-zinc-500">{POSE_COPY[pose].note}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Hand-drawn speech bubble, both sides</div>
            <div className="mt-1 text-xs text-zinc-500">
              Wobbly SVG outline (teal marker-pen stroke, cream fill), Patrick Hand font, the tail always points at
              the cat. Beside the cat, level with its head.
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-12 pb-4">
              <BubbleDemo side="left" />
              <BubbleDemo side="right" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-zinc-50">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Previous styles</div>
            <div className="mt-1 text-xs text-zinc-500">
              The code-drawn cats this illustration replaced. Not used on any live page.
            </div>
            <div className="mt-4 text-xs font-medium text-zinc-600">Line drawing</div>
            <div className="mt-3 flex flex-wrap items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvg pose="sitting" expression="content" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Content</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvg pose="sitting" expression="sleepy" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Sleepy</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvg pose="loaf" expression="content" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Loaf</div>
              </div>
            </div>
            <div className="mt-6 text-xs font-medium text-zinc-600">Flat cartoon</div>
            <div className="mt-3 flex flex-wrap items-end gap-6">
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvgCartoon pose="sitting" expression="open" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Sitting</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvgCartoon pose="sitting" expression="sleepy" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Sleepy</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 120, height: 120 }}>
                  <CatSvgCartoon pose="sitting" expression="happy" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">Happy</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
