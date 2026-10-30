"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/components/ask/AskProvider";
import { IllustratedCatSwitch } from "./IllustratedCat";
import { SpeechBubble } from "./SpeechBubble";
import { useMascotCelebrateKey } from "@/lib/mascot/celebrate";

type MascotCornerProps = {
  /**
   * "ambient" is Home, "static" is an empty state. Both rest on the content
   * pose. "celebrate" shows the same cat briefly when celebrateKey bumps.
   * Idle pose changes (sleeping, lying, stretch, hop) are not part of this pass.
   */
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
  const [celebrating, setCelebrating] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const celebrateFiredRef = useRef({ prop: celebrateKey, home: homeCelebrateKey });

  useEffect(() => {
    const changed = celebrateKey !== celebrateFiredRef.current.prop || homeCelebrateKey !== celebrateFiredRef.current.home;
    celebrateFiredRef.current = { prop: celebrateKey, home: homeCelebrateKey };
    if (!changed || !enabled) return;

    const show = window.setTimeout(() => setCelebrating(true), 0);
    const hideAt = window.setTimeout(() => setCelebrating(false), 2600);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hideAt);
    };
  }, [celebrateKey, homeCelebrateKey, enabled]);

  if (!enabled) return null;
  if (mode === "celebrate" && !celebrating) return null;

  const visible = !suppressed;
  const showAlert = bubbleOpen && !reducedMotion;

  return (
    <div className="mascot-strip">
      <SpeechBubble label="Life CFO's cat mascot" side="left" onOpenChange={setBubbleOpen}>
        <div className="mascot-strip-cat" data-visible={visible ? "true" : "false"}>
          <IllustratedCatSwitch alert={showAlert} breathe={!reducedMotion} />
        </div>
      </SpeechBubble>
    </div>
  );
}
