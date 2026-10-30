"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useAsk } from "@/components/ask/AskProvider";
import { CatPoseStack } from "./IllustratedCat";
import { SpeechBubble } from "./SpeechBubble";
import { useMascotIdle } from "./useMascotIdle";
import { useMascotCelebrateKey } from "@/lib/mascot/celebrate";
import { isDevOrPreviewEnvironment } from "@/lib/mascot/isDevOrPreview";
import { ALERT_RETURN_MS } from "@/lib/mascot/idlePlan";
import { MASCOT_SPEECH_ENABLED } from "@/lib/mascot/speechFlag";

type MascotCornerProps = {
  /** "ambient" is Home. "static" is an empty state. "celebrate" shows the cat briefly. */
  mode: "ambient" | "static" | "celebrate";
  enabled: boolean;
  reducedMotion: boolean;
  /** "celebrate" mode: bump to replay. Combined with the shared Home celebration event if ambient. */
  celebrateKey?: number;
};

function useMascotDemo(allow: boolean): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (!allow || !isDevOrPreviewEnvironment()) return;
    if (new URLSearchParams(window.location.search).get("mascotDemo") !== "1") return;
    const id = window.setTimeout(() => setDemo(true), 0);
    return () => window.clearTimeout(id);
  }, [allow]);
  return demo;
}

export function MascotCorner({ mode, enabled, reducedMotion, celebrateKey = 0 }: MascotCornerProps) {
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const suppressed = mobileMenuOpen || askOpen;

  const homeCelebrateKey = useMascotCelebrateKey(mode === "ambient");
  const [celebrating, setCelebrating] = useState(false);
  const [speechOpen, setSpeechOpen] = useState(false);
  const [alert, setAlert] = useState(false);
  const celebrateFiredRef = useRef({ prop: celebrateKey, home: homeCelebrateKey });
  const returnTimerRef = useRef<number | null>(null);
  const demo = useMascotDemo(mode === "ambient");

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

  useEffect(() => () => {
    if (returnTimerRef.current != null) window.clearTimeout(returnTimerRef.current);
  }, []);

  const visible = !suppressed;
  const idlePose = useMascotIdle({
    enabled: enabled && !reducedMotion && mode !== "celebrate",
    paused: alert || speechOpen || !visible,
    demo,
  });

  function clearReturn() {
    if (returnTimerRef.current != null) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
  }

  function engage() {
    clearReturn();
    setAlert(true);
  }

  function release() {
    clearReturn();
    returnTimerRef.current = window.setTimeout(() => setAlert(false), ALERT_RETURN_MS);
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "touch") release();
  }

  if (!enabled) return null;
  if (mode === "celebrate" && !celebrating) return null;

  const shown = alert || (MASCOT_SPEECH_ENABLED && speechOpen) ? "alert" : idlePose;
  const breathe = !reducedMotion && shown === "content";
  const cat = (
    <div className="mascot-strip-cat" data-visible={visible ? "true" : "false"}>
      <CatPoseStack pose={shown} breathe={breathe} />
    </div>
  );

  return (
    <div className="mascot-strip">
      {MASCOT_SPEECH_ENABLED ? (
        <SpeechBubble label="Life CFO's cat mascot" onOpenChange={setSpeechOpen}>
          {cat}
        </SpeechBubble>
      ) : (
        <div className="mascot-anchor" data-mascot-anchor="" onPointerEnter={engage} onPointerLeave={release}>
          <button
            type="button"
            className="mascot-cat-button"
            aria-label="Life CFO's cat mascot"
            onPointerDown={engage}
            onPointerUp={onPointerUp}
            onFocus={engage}
            onBlur={release}
          >
            {cat}
          </button>
        </div>
      )}
    </div>
  );
}
