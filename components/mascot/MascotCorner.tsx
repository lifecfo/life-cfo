"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/components/ask/AskProvider";
import { CatSvg } from "./CatSvg";
import { SpeechBubble } from "./SpeechBubble";
import { useMascotCelebrateKey } from "@/lib/mascot/celebrate";

function randomMs(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

const MIN_GUTTER_PX = 170;
const MOBILE_BREAKPOINT_PX = 768;

type Placement = "gutter" | "strip" | "none";

/**
 * Measures the ACTUAL available width around the content column -- not
 * window.innerWidth, which ignores AppShell's sidebar and would wrongly
 * think there's gutter space at 1280px that the sidebar has already
 * eaten. A full-width marker div (measuringRef) reports the real width
 * of whatever container the page's content sits in.
 */
function usePlacement(contentMaxWidth: number) {
  const measuringRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement>("none");

  useEffect(() => {
    function update() {
      if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
        setPlacement("strip");
        return;
      }
      const containerWidth = measuringRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      const gutter = (containerWidth - contentMaxWidth) / 2;
      setPlacement(gutter >= MIN_GUTTER_PX ? "gutter" : "none");
    }

    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && measuringRef.current) ro.observe(measuringRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [contentMaxWidth]);

  return { measuringRef, placement };
}

type AmbientPhase = "waiting" | "sitting" | "napping";

type MascotCornerProps = {
  /** "ambient" cycles on/off and naps sometimes (Home). "static" is always
   * visible while mounted (empty states). "celebrate" shows briefly with a
   * happy tail wag, triggered by celebrateKey. */
  mode: "ambient" | "static" | "celebrate";
  /** Must match the page's own content column max-width (px) so the gutter aligns next to it, not over it. */
  contentMaxWidth: number;
  enabled: boolean;
  reducedMotion: boolean;
  /** "celebrate" mode: bump to replay. Combined with the shared Home celebration event if ambient. */
  celebrateKey?: number;
};

export function MascotCorner({ mode, contentMaxWidth, enabled, reducedMotion, celebrateKey = 0 }: MascotCornerProps) {
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const suppressed = mobileMenuOpen || askOpen;
  const { measuringRef, placement } = usePlacement(contentMaxWidth);

  const homeCelebrateKey = useMascotCelebrateKey(mode === "ambient");
  const [phase, setPhase] = useState<AmbientPhase>("waiting");
  const [celebrating, setCelebrating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateFiredRef = useRef({ prop: celebrateKey, home: homeCelebrateKey });

  // Ambient cycle: wait, appear sitting a while, sometimes nap, disappear, repeat.
  useEffect(() => {
    if (mode !== "ambient" || !enabled) return;

    if (reducedMotion) {
      setPhase("sitting");
      return;
    }

    const schedule = (next: AmbientPhase, delayMs: number) => {
      timerRef.current = setTimeout(() => setPhase(next), delayMs);
    };

    if (phase === "waiting") schedule("sitting", randomMs(20000, 40000));
    else if (phase === "sitting") {
      const napsNext = Math.random() < 0.3;
      schedule(napsNext ? "napping" : "waiting", randomMs(15000, 30000));
    } else if (phase === "napping") schedule("waiting", randomMs(20000, 40000));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [mode, enabled, reducedMotion, phase]);

  // Celebration: fires on an external celebrateKey bump (e.g. Bills'
  // first-bill-added) or the shared Home celebration signal.
  useEffect(() => {
    const changed = celebrateKey !== celebrateFiredRef.current.prop || homeCelebrateKey !== celebrateFiredRef.current.home;
    celebrateFiredRef.current = { prop: celebrateKey, home: homeCelebrateKey };
    if (!changed || !enabled) return;

    setCelebrating(true);
    const hideAt = setTimeout(() => setCelebrating(false), 2600);
    return () => clearTimeout(hideAt);
  }, [celebrateKey, homeCelebrateKey, enabled]);

  if (!enabled) return <div ref={measuringRef} style={{ width: "100%", height: 0 }} />;

  // "celebrate" is purely transient -- nothing to anchor when it's not firing.
  if (mode === "celebrate" && !celebrating) {
    return <div ref={measuringRef} style={{ width: "100%", height: 0 }} />;
  }

  const visible =
    !suppressed &&
    (mode === "static" || celebrating || (mode === "ambient" && (phase === "sitting" || phase === "napping")));

  const expression = celebrating ? "happy" : phase === "napping" && mode === "ambient" ? "sleepy" : "open";
  const cat = (
    <SpeechBubble label="Life CFO's cat mascot">
      <CatSvg pose="sitting" expression={expression} />
    </SpeechBubble>
  );

  if (placement === "none") {
    return <div ref={measuringRef} style={{ width: "100%", height: 0 }} />;
  }

  if (placement === "gutter") {
    return (
      <div ref={measuringRef} style={{ width: "100%", height: 0 }}>
        <div className="mascot-corner-gutter" style={{ maxWidth: contentMaxWidth, margin: "0 auto" }}>
          <div className={`mascot-corner-gutter-cat${celebrating ? " mascot-corner--celebrate" : ""}`} data-visible={visible ? "true" : "false"}>
            {cat}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={measuringRef} style={{ width: "100%" }}>
      <div className="mascot-corner-strip">
        <div className={`mascot-corner-strip-cat${celebrating ? " mascot-corner--celebrate" : ""}`} data-visible={visible ? "true" : "false"}>
          {cat}
        </div>
      </div>
    </div>
  );
}
