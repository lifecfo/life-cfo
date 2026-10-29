"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getStickyMascotLine } from "@/lib/mascot/lineMemory";
import { BubbleShape } from "./BubbleShape";
import { mascotHandwrittenFont } from "./mascotFont";

const HOVER_CLOSE_DELAY_MS = 300;

type SpeechBubbleProps = {
  children: React.ReactNode;
  label: string;
  /** Which side of the cat the bubble opens on -- real flex space, never absolutely overlaid, so it can't drift outside the strip. */
  side: "left" | "right";
  className?: string;
};

/**
 * Wraps the mascot SVG in a focusable button, with the speech bubble as
 * a real flex sibling (not an absolute overlay) so it's physically
 * contained by whatever row it's laid out in -- it can only ever be as
 * tall as that row allows, never drifting above it into page content.
 *
 * Desktop: hover shows the bubble, moving away hides it after a short
 * delay (so it doesn't flicker). Touch: tap toggles it. Keyboard: focus
 * shows, blur hides. The line itself is sticky for 5 minutes
 * (lib/mascot/lineMemory.ts) -- repeated open/close never changes it
 * mid-window.
 */
export function SpeechBubble({ children, label, side, className }: SpeechBubbleProps) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bubbleId = useId();

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function show() {
    clearHideTimer();
    setLine(getStickyMascotLine());
    setOpen(true);
  }

  function hideNow() {
    clearHideTimer();
    setOpen(false);
  }

  function hideAfterDelay() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) hideNow();
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => clearHideTimer, []);

  const bubble = open ? (
    <div id={bubbleId} className="mascot-bubble-slot" role="status" aria-live="polite">
      <BubbleShape tailSide={side} />
      <span className={`mascot-bubble-text ${mascotHandwrittenFont.className}`}>{line}</span>
    </div>
  ) : null;

  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-describedby={open ? bubbleId : undefined}
      onClick={() => (open ? hideNow() : show())}
      onMouseEnter={show}
      onMouseLeave={hideAfterDelay}
      onFocus={show}
      onBlur={hideNow}
      className="mascot-cat-button"
    >
      {children}
    </button>
  );

  return (
    <div ref={wrapRef} className={`mascot-bubble-row ${className ?? ""}`}>
      {side === "left" ? bubble : null}
      {button}
      {side === "right" ? bubble : null}
    </div>
  );
}
