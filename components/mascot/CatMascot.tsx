"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/components/ask/AskProvider";
import { CatSvg } from "./CatSvg";
import { BoxSvg } from "./BoxSvg";
import { SpeechBubble } from "./SpeechBubble";
import { ambientCatSamplePoints, isMascotBandClear } from "@/lib/mascot/isBandClear";

function randomMs(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

type AmbientPhase = "waiting" | "peeking" | "walking" | "sitting" | "napping";

type CatMascotProps = {
  variant: "ambient" | "peek" | "celebrate";
  enabled: boolean;
  reducedMotion: boolean;
  /** Ambient only: hide (but keep running in the background) while a scene plays, or the mobile Menu/Ask panel is open. */
  suppressed?: boolean;
  /** Celebrate only: bump this to replay the brief tail-wag entrance. */
  celebrateKey?: number;
};

export function CatMascot({ variant, enabled, reducedMotion, suppressed = false, celebrateKey = 0 }: CatMascotProps) {
  // Never while the mobile Menu or the Ask panel is open, on any variant --
  // not just the ambient Home cat.
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const globallySuppressed = mobileMenuOpen || askOpen;

  if (variant === "ambient") {
    return <AmbientCat enabled={enabled} reducedMotion={reducedMotion} suppressed={suppressed || globallySuppressed} />;
  }
  if (variant === "peek") {
    return globallySuppressed ? null : <PeekCat enabled={enabled} reducedMotion={reducedMotion} />;
  }
  // Stay mounted (don't conditionally unmount) so a celebrateKey bump that
  // lands while suppressed isn't lost -- CelebrateCat gates its own output.
  return (
    <CelebrateCat enabled={enabled} reducedMotion={reducedMotion} celebrateKey={celebrateKey} suppressed={globallySuppressed} />
  );
}

const RETRY_WHEN_BLOCKED_MS = 5000;

function AmbientCat({
  enabled,
  reducedMotion,
  suppressed,
}: {
  enabled: boolean;
  reducedMotion: boolean;
  suppressed: boolean;
}) {
  const [phase, setPhase] = useState<AmbientPhase>("waiting");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Reduced motion: a permanently static sitting cat, no cycle at all.
    if (reducedMotion) {
      setPhase("sitting");
      return;
    }

    const schedule = (next: AmbientPhase, delayMs: number) => {
      timerRef.current = setTimeout(() => setPhase(next), delayMs);
    };

    if (phase === "waiting") {
      const tryToAppear = () => {
        if (isMascotBandClear(ambientCatSamplePoints())) {
          setPhase("peeking");
        } else {
          timerRef.current = setTimeout(tryToAppear, RETRY_WHEN_BLOCKED_MS);
        }
      };
      timerRef.current = setTimeout(tryToAppear, randomMs(20000, 40000));
    } else if (phase === "peeking") schedule("walking", 2200);
    else if (phase === "walking") schedule("sitting", 2400);
    else if (phase === "sitting") {
      const napsNext = Math.random() < 0.3;
      schedule(napsNext ? "napping" : "waiting", randomMs(15000, 30000));
    } else if (phase === "napping") schedule("waiting", randomMs(20000, 40000));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, enabled, reducedMotion]);

  if (!enabled) return null;

  const visible = !suppressed;
  const peeking = phase === "peeking";
  const showFullCat = phase === "walking" || phase === "sitting" || phase === "napping";
  const walkedOut = phase === "sitting" || phase === "napping";

  return (
    <div className="mascot-ambient-wrap" data-mascot-layer="true" style={{ opacity: visible ? 1 : 0 }}>
      <div className="mascot-peek-stage" data-visible={peeking ? "true" : "false"}>
        <div className="mascot-box">
          <BoxSvg style={{ width: "100%", height: "100%" }} />
        </div>
        <div className="mascot-peek-head" data-shown={peeking ? "true" : "false"}>
          <CatSvg pose="peek-head" />
        </div>
      </div>

      {showFullCat ? (
        <div className="mascot-full-cat" data-shown="true" style={{ transform: walkedOut ? "translateX(26px)" : "translateX(0)" }}>
          <SpeechBubble label="Life CFO's cat mascot">
            <CatSvg pose={phase === "walking" ? "walking" : "sitting"} expression={phase === "napping" ? "sleepy" : "open"} />
          </SpeechBubble>
        </div>
      ) : null}
    </div>
  );
}

function PeekCat({ enabled, reducedMotion }: { enabled: boolean; reducedMotion: boolean }) {
  if (!enabled) return null;
  void reducedMotion; // the CSS media query already removes the idle motion; the pose itself is already static.

  return (
    <div className="mascot-peek-stage" data-visible="true" data-mascot-layer="true" style={{ position: "relative" }}>
      <div className="mascot-box">
        <BoxSvg style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="mascot-peek-head" data-shown="true">
        <SpeechBubble label="Life CFO's cat mascot">
          <CatSvg pose="peek-head" />
        </SpeechBubble>
      </div>
    </div>
  );
}

function CelebrateCat({
  enabled,
  reducedMotion,
  celebrateKey,
  suppressed,
}: {
  enabled: boolean;
  reducedMotion: boolean;
  celebrateKey: number;
  suppressed: boolean;
}) {
  const [shown, setShown] = useState(false);
  const firedRef = useRef(celebrateKey);

  useEffect(() => {
    if (celebrateKey === firedRef.current) return;
    firedRef.current = celebrateKey;
    if (!enabled) return;

    setShown(true);
    const hideAt = setTimeout(() => setShown(false), 2600);
    return () => clearTimeout(hideAt);
  }, [celebrateKey, enabled]);

  if (!enabled) return null;
  void reducedMotion; // the CSS media query already removes the tail-wag animation.

  return (
    <div className="mascot-celebrate-wrap" data-mascot-layer="true" data-shown={shown && !suppressed ? "true" : "false"} aria-hidden="true">
      <CatSvg pose="sitting" expression="happy" />
    </div>
  );
}
