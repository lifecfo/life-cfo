"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getStickyMascotLine } from "@/lib/mascot/lineMemory";
import { BubbleShape } from "./BubbleShape";
import { mascotHandwrittenFont } from "./mascotFont";

const HOVER_CLOSE_DELAY_MS = 300;
const BUBBLE_FADE_MS = 500;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type SpeechBubbleProps = {
  children: React.ReactNode;
  label: string;
  /** Which side of the cat the bubble opens on -- real flex space, never absolutely overlaid, so it can't drift outside the strip. */
  side: "left" | "right";
  className?: string;
  /** Fires when the bubble opens or starts to hide, so the cat can cross-fade with it. */
  onOpenChange?: (open: boolean) => void;
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
export function SpeechBubble({ children, label, side, className, onOpenChange }: SpeechBubbleProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [line, setLine] = useState("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bubbleId = useId();

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function clearUnmountTimer() {
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  }

  function show() {
    clearHideTimer();
    clearUnmountTimer();
    openRef.current = true;
    setLine(getStickyMascotLine());
    setMounted(true);
    setOpen(true);
    onOpenChange?.(true);
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (openRef.current) setVisible(true);
      });
    });
  }

  function hideNow() {
    clearHideTimer();
    openRef.current = false;
    setOpen(false);
    setVisible(false);
    onOpenChange?.(false);
    clearUnmountTimer();
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    unmountTimerRef.current = setTimeout(() => setMounted(false), BUBBLE_FADE_MS);
  }

  function hideAfterDelay() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => hideNow(), HOVER_CLOSE_DELAY_MS);
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

  useEffect(() => {
    const hideTimer = hideTimerRef;
    const unmountTimer = unmountTimerRef;
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, []);

  const bubble = mounted ? (
    <div
      id={bubbleId}
      className="mascot-bubble-slot"
      data-shown={visible ? "true" : "false"}
      role={open ? "status" : undefined}
      aria-live={open ? "polite" : undefined}
      aria-hidden={open ? undefined : true}
    >
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
