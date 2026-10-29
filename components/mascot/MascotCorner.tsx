"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/components/ask/AskProvider";
import { CatSvg, type CatPose } from "./CatSvg";
import { SpeechBubble } from "./SpeechBubble";
import { useMascotCelebrateKey } from "@/lib/mascot/celebrate";

function randomMs(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

type AwakePose = "sitting" | "loaf";
type PouncePhase = "none" | "crouch" | "hop" | "land";

type MascotCornerProps = {
  /** "ambient" cycles sitting/loaf and occasionally pounces (Home). "static" just sits, idle animations only (empty states). "celebrate" shows briefly with a happy tail wag, triggered by celebrateKey. */
  mode: "ambient" | "static" | "celebrate";
  enabled: boolean;
  reducedMotion: boolean;
  /** "celebrate" mode: bump to replay. Combined with the shared Home celebration event if ambient. */
  celebrateKey?: number;
};

export function MascotCorner({ mode, enabled, reducedMotion, celebrateKey = 0 }: MascotCornerProps) {
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const suppressed = mobileMenuOpen || askOpen;

  const homeCelebrateKey = useMascotCelebrateKey(mode === "ambient");
  const [awakePose, setAwakePose] = useState<AwakePose>("sitting");
  const [poseTransitioning, setPoseTransitioning] = useState(false);
  const [pounce, setPounce] = useState<PouncePhase>("none");
  const [celebrating, setCelebrating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateFiredRef = useRef({ prop: celebrateKey, home: homeCelebrateKey });

  // Rare pose change (sitting <-> loaf), every few minutes, with a soft
  // opacity dip synced to the transform change.
  useEffect(() => {
    if (mode !== "ambient" || !enabled || reducedMotion) return;

    const id = setTimeout(() => {
      setPoseTransitioning(true);
      setTimeout(() => {
        setAwakePose((p) => (p === "sitting" ? "loaf" : "sitting"));
        setPoseTransitioning(false);
      }, 350);
    }, randomMs(180000, 360000));

    return () => clearTimeout(id);
  }, [mode, enabled, reducedMotion, awakePose]);

  // Occasional pounce: crouch (with a bum wiggle) -> hop -> land -> settle.
  useEffect(() => {
    if (mode !== "ambient" || !enabled || reducedMotion || pounce !== "none") return;

    const id = setTimeout(() => {
      setPounce("crouch");
      const t1 = setTimeout(() => setPounce("hop"), 900);
      const t2 = setTimeout(() => setPounce("land"), 1700);
      const t3 = setTimeout(() => setPounce("none"), 2500);
      timerRef.current = t3;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, randomMs(150000, 300000));

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, enabled, reducedMotion, pounce]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

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

  if (!enabled) return null;
  if (mode === "celebrate" && !celebrating) return null;

  const visible = !suppressed;

  const pose: CatPose =
    mode === "ambient" && pounce !== "none"
      ? pounce === "crouch"
        ? "crouch"
        : pounce === "hop"
          ? "pounce"
          : "sitting"
      : mode === "ambient"
        ? awakePose
        : "sitting";

  const expression = celebrating ? "happy" : "content";
  const wiggle = pounce === "crouch";

  const catOpacity = !visible ? 0 : poseTransitioning ? 0.75 : 1;

  return (
    <div className="mascot-strip">
      <SpeechBubble label="Life CFO's cat mascot" side="left" className={celebrating ? "mascot-corner--celebrate" : undefined}>
        <div className="mascot-strip-cat" data-visible={visible ? "true" : "false"} style={{ opacity: catOpacity }}>
          <CatSvg pose={pose} expression={expression} wiggle={wiggle} />
        </div>
      </SpeechBubble>
    </div>
  );
}
