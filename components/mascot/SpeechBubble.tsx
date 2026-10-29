"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getStickyMascotLine } from "@/lib/mascot/lineMemory";
import { BubbleShape } from "./BubbleShape";
import { mascotHandwrittenFont } from "./mascotFont";

const HOVER_CLOSE_DELAY_MS = 300;

type SpeechBubbleProps = {
  children: React.ReactNode;
  label: string;
  tailSide?: "left" | "right";
  className?: string;
};

/**
 * Wraps the mascot SVG in a focusable button. Desktop: hover shows the
 * bubble, moving away hides it after a short delay (so it doesn't
 * flicker). Touch: tap toggles it. Keyboard: focus shows, blur hides.
 * The line itself is sticky for 5 minutes (lib/mascot/lineMemory.ts) --
 * repeated open/close never changes it mid-window.
 */
export function SpeechBubble({ children, label, tailSide = "left", className }: SpeechBubbleProps) {
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

  return (
    <div ref={wrapRef} className={`mascot-bubble-wrap ${className ?? ""}`}>
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
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", pointerEvents: "auto", display: "block" }}
      >
        {children}
      </button>
      <div
        id={bubbleId}
        className={`mascot-bubble ${mascotHandwrittenFont.className}`}
        data-open={open}
        data-tail-side={tailSide}
        role="status"
        aria-live="polite"
      >
        <BubbleShape tailSide={tailSide} />
        <span className="mascot-bubble-text">{open ? line : ""}</span>
      </div>
    </div>
  );
}
