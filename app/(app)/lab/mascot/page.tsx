"use client";

import { Page } from "@/components/Page";
import { Card, CardContent } from "@/components/ui";
import { CatSvg, type CatExpression, type CatPose } from "@/components/mascot/CatSvg";
import { CatSvgCartoon } from "@/components/mascot/CatSvgCartoon";
import { BubbleShape } from "@/components/mascot/BubbleShape";
import { mascotHandwrittenFont } from "@/components/mascot/mascotFont";
import { MASCOT_MOUSE_ENABLED } from "@/lib/mascot/mouseFlag";

export const dynamic = "force-dynamic";

type PosePreview = {
  label: string;
  pose: CatPose;
  expression: CatExpression;
  note: string;
};

const POSES: PosePreview[] = [
  { label: "Sitting", pose: "sitting", expression: "content", note: "Default resting pose -- ambient idle, empty-state cat." },
  { label: "Loaf (lying down)", pose: "loaf", expression: "content", note: "Rare pose change from sitting, soft cross-fade + squash." },
  { label: "Crouch", pose: "crouch", expression: "alert", note: "Pounce wind-up -- paired with a brief bum wiggle." },
  { label: "Mid-pounce", pose: "pounce", expression: "alert", note: "Short hop forward, then settles back to sitting." },
  { label: "Sleepy", pose: "sitting", expression: "sleepy", note: "Closed downward-arc eye, floating z." },
  { label: "Happy", pose: "sitting", expression: "happy", note: "Upside-down-U eye -- small-win celebration, paired with a tail wag." },
];

const EXPRESSIONS: { label: string; expression: CatExpression; note: string }[] = [
  { label: "Content (default)", expression: "content", note: "Soft upward curve. Blinks to a closed line every 20-60s." },
  { label: "Alert", expression: "alert", note: "Small filled dot -- reserved for mouse scenes (currently paused)." },
  { label: "Sleepy", expression: "sleepy", note: "Closed downward arc, floating z." },
  { label: "Happy", expression: "happy", note: "Upside-down U." },
];

function PoseCard({ preview }: { preview: PosePreview }) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <div style={{ width: 120, height: 120 }}>
          <CatSvg pose={preview.pose} expression={preview.expression} style={{ width: "100%", height: "100%" }} />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-900">{preview.label}</div>
          <div className="mt-1 text-xs text-zinc-500">{preview.note}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BubbleDemo({ side }: { side: "left" | "right" }) {
  const bubble = (
    <div className="mascot-bubble-slot" style={{ width: 170 }}>
      <BubbleShape tailSide={side} />
      <span className={`mascot-bubble-text ${mascotHandwrittenFont.className}`}>Done is cosier than perfect.</span>
    </div>
  );
  const cat = (
    <div style={{ width: 96, height: 96 }}>
      <CatSvg pose="sitting" expression="content" style={{ width: "100%", height: "100%" }} />
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mascot-bubble-row" style={{ alignItems: "flex-start" }}>
        {side === "left" ? bubble : null}
        {cat}
        {side === "right" ? bubble : null}
      </div>
      <div className="text-xs text-zinc-500">Bubble on the {side}, tail pointing {side === "left" ? "right" : "left"} at the cat</div>
    </div>
  );
}

export default function MascotLabPage() {
  return (
    <Page title="Mascot preview" subtitle="Developer-only. Line-art cat, new placement, hand-drawn bubble.">
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
            <div className="text-sm font-semibold text-zinc-900">Poses</div>
            <div className="mt-1 text-xs text-zinc-500">
              Rendered at 120px (production desktop size) -- mobile is 96px. &ldquo;Loaf&rdquo; is a rare pose change from
              sitting; &ldquo;Crouch&rdquo; and &ldquo;Mid-pounce&rdquo; are steps in the occasional pounce sequence.
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {POSES.map((preview) => (
                <PoseCard key={preview.label} preview={preview} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Eye expressions</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              {EXPRESSIONS.map((e) => (
                <div key={e.label} className="flex flex-col items-center gap-2 text-center">
                  <div style={{ width: 96, height: 96 }}>
                    <CatSvg pose="sitting" expression={e.expression} style={{ width: "100%", height: "100%" }} />
                  </div>
                  <div className="text-xs font-medium text-zinc-700">{e.label}</div>
                  <div className="text-xs text-zinc-500">{e.note}</div>
                </div>
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
                  <CatSvg pose="sitting" expression="content" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">120px</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div style={{ width: 96, height: 96 }}>
                  <CatSvg pose="sitting" expression="content" style={{ width: "100%", height: "100%" }} />
                </div>
                <div className="text-xs text-zinc-500">96px</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Hand-drawn speech bubble, both sides</div>
            <div className="mt-1 text-xs text-zinc-500">
              Wobbly SVG outline (teal marker-pen stroke, cream fill), Patrick Hand font, the tail always points at
              the cat. Beside the cat, level with its head -- never above it.
            </div>
            <div className="mt-6 flex flex-wrap gap-12 pb-4">
              <BubbleDemo side="left" />
              <BubbleDemo side="right" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-zinc-50">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Previous style (for comparison)</div>
            <div className="mt-1 text-xs text-zinc-500">
              The filled flat-cartoon cat used before this pass. Not used anywhere live anymore.
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-6">
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
